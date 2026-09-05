using AutomotorasApi.Models;
using Azure;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Microsoft.Extensions.Logging;

namespace AutomotorasApi.Services;

public class BlobStorageService
{
    private readonly BlobServiceClient _blobServiceClient;
    private readonly ILogger<BlobStorageService>? _logger;
    public const string VehicleImagesContainer = "vehicle-images";
    public const string DealershipLogosContainer = "dealership-logos";
    public const string AdBannersContainer = "ad-banners";

    public BlobStorageService(BlobServiceClient blobServiceClient, ILogger<BlobStorageService>? logger = null)
    {
        _blobServiceClient = blobServiceClient;
        _logger = logger;
    }

    private async Task<BlobContainerClient> GetContainerAsync(string name)
    {
        var container = _blobServiceClient.GetBlobContainerClient(name);
        await container.CreateIfNotExistsAsync(PublicAccessType.Blob);
        return container;
    }

    private static string GetExtension(string contentType) => contentType switch
    {
        "image/jpeg" => ".jpg",
        "image/png" => ".png",
        "image/webp" => ".webp",
        _ => throw new ApiException(400, "invalid_image_type", "Solo se permiten imágenes JPEG, PNG o WebP.")
    };

    public async Task<string> UploadVehicleImageAsync(string vehicleId, Stream imageStream, string contentType)
    {
        ValidateBlobId(vehicleId);
        return await UploadAsync(VehicleImagesContainer, vehicleId, imageStream, contentType);
    }

    public async Task<string> UploadTemporaryVehicleImageAsync(string dealershipId, Stream imageStream, string contentType)
    {
        ValidateBlobId(dealershipId);
        return await UploadAsync(VehicleImagesContainer, $"temp/{dealershipId}", imageStream, contentType);
    }

    private async Task<string> UploadAsync(string containerName, string prefix, Stream imageStream, string contentType)
    {
        var extension = GetExtension(contentType);
        var container = await GetContainerAsync(containerName);
        var blobName = $"{prefix}/{Guid.NewGuid():N}{extension}";
        var blob = container.GetBlobClient(blobName);
        await blob.UploadAsync(imageStream, new BlobUploadOptions
        {
            HttpHeaders = new BlobHttpHeaders { ContentType = contentType, CacheControl = "public, max-age=31536000, immutable" },
            Conditions = new BlobRequestConditions { IfNoneMatch = ETag.All }
        });
        return blob.Uri.ToString();
    }

    public async Task<string> UploadDealershipLogoAsync(string dealershipId, Stream imageStream, string contentType)
    {
        ValidateBlobId(dealershipId);
        // Versioned names avoid overwriting the live logo before its new metadata is committed.
        return await UploadAsync(DealershipLogosContainer, dealershipId, imageStream, contentType);
    }

    public async Task<string> UploadAdImageAsync(string adId, Stream imageStream, string contentType)
    {
        ValidateBlobId(adId);
        return await UploadAsync(AdBannersContainer, adId, imageStream, contentType);
    }

    public async Task<bool> DeleteBlobByUrlAsync(string blobUrl, string? expectedContainer = null)
    {
        if (!TryResolveBlobUrl(_blobServiceClient.Uri, blobUrl, expectedContainer, out var containerName, out var blobName))
            return false;

        var container = _blobServiceClient.GetBlobContainerClient(containerName);
        var result = await container.GetBlobClient(blobName).DeleteIfExistsAsync();
        return result.Value;
    }

    public async Task CleanupFailedUploadAsync(string url, string expectedContainer)
    {
        try
        {
            await DeleteBlobByUrlAsync(url, expectedContainer);
        }
        catch (RequestFailedException ex)
        {
            // Preserve the original metadata error. Do not log URLs, SAS queries or file contents.
            LogCleanupFailure(expectedContainer, ex.Status);
        }
    }

    private void LogCleanupFailure(string container, int status) =>
        _logger?.LogWarning("No se pudo limpiar una imagen nueva de {Container}; estado de almacenamiento {Status}.", container, status);

    public async Task ValidateVehicleImageUrlsAsync(string[] urls, string dealershipId, VehicleEntity? existing = null)
    {
        ValidateBlobId(dealershipId);
        var persisted = existing is null ? Array.Empty<string>() : VehicleStorageService.ParseImageUrls(existing);
        foreach (var url in urls)
        {
            // Preserve existing references, including trusted legacy/seed placeholders.
            if (persisted.Contains(url, StringComparer.Ordinal)) continue;
            if (!TryResolveBlobUrl(_blobServiceClient.Uri, url, VehicleImagesContainer, out _, out var name) ||
                !IsOwnedTemporaryName(name, dealershipId))
                throw new ApiException(400, "invalid_vehicle_image",
                    "Usá una imagen temporal subida por esta automotora o una imagen que ya pertenezca a este vehículo.");

            var exists = await _blobServiceClient.GetBlobContainerClient(VehicleImagesContainer).GetBlobClient(name).ExistsAsync();
            if (!exists.Value)
                throw new ApiException(400, "vehicle_image_not_found", "La imagen temporal no existe. Volvé a subirla.");
        }
    }

    public bool IsPersistedVehicleImageUrl(VehicleEntity vehicle, string url)
    {
        if (!VehicleStorageService.ParseImageUrls(vehicle).Contains(url, StringComparer.Ordinal) ||
            !TryResolveBlobUrl(_blobServiceClient.Uri, url, VehicleImagesContainer, out _, out var name))
            return false;

        // Old temp/{guid}.jpg URLs have no tenant prefix. They are removable ONLY through
        // an exact reference already persisted on this authorized vehicle, never a client path.
        return name.StartsWith($"{vehicle.RowKey}/", StringComparison.Ordinal) ||
            name.StartsWith("temp/", StringComparison.Ordinal);
    }

    public static bool TryResolveBlobUrl(Uri serviceUri, string? blobUrl, string? expectedContainer,
        out string containerName, out string blobName)
    {
        containerName = string.Empty;
        blobName = string.Empty;
        if (!IsValidBlobUrlText(blobUrl) || !Uri.TryCreate(blobUrl, UriKind.Absolute, out var uri) ||
            !IsSameServiceOrigin(serviceUri, uri))
            return false;

        // Azure: /container/blob. Azurite (or a path-based endpoint): /account/container/blob.
        // URI paths always use '/', including on Windows; Path.DirectorySeparatorChar is not valid here.
        var basePath = serviceUri.AbsolutePath.TrimEnd('/') + '/'; // NOSONAR: URI, not a filesystem path.
        if (!uri.AbsolutePath.StartsWith(basePath, StringComparison.Ordinal)) return false;
        var relative = uri.AbsolutePath[basePath.Length..];
        var separator = relative.IndexOf('/');
        if (separator <= 0 || separator == relative.Length - 1) return false;

        var container = relative[..separator];
        if (container is not (VehicleImagesContainer or DealershipLogosContainer or AdBannersContainer) ||
            (expectedContainer is not null && !string.Equals(container, expectedContainer, StringComparison.Ordinal)))
            return false;

        var name = Uri.UnescapeDataString(relative[(separator + 1)..]);
        if (name.Any(c => char.IsControl(c) || c is '\\' or '%' or '|' or '?' or '#') ||
            name.Split('/').Any(segment => segment.Length == 0 || segment is "." or ".."))
            return false;

        containerName = container;
        blobName = name;
        return true;
    }

    private static bool IsValidBlobUrlText(string? url) =>
        !string.IsNullOrWhiteSpace(url) && url.Length <= 2048 && url == url.Trim() &&
        !url.Any(c => char.IsControl(c) || c is '\\' or '?' or '#' or '|') &&
        // Reject traversal before Uri's canonicalization can hide dot segments.
        !Uri.UnescapeDataString(url).Split('/').Any(segment => segment is "." or "..");

    private static bool IsSameServiceOrigin(Uri service, Uri candidate) =>
        candidate.Scheme is "http" or "https" &&
        string.Equals(candidate.Scheme, service.Scheme, StringComparison.OrdinalIgnoreCase) &&
        string.Equals(candidate.Authority, service.Authority, StringComparison.OrdinalIgnoreCase) &&
        candidate.UserInfo.Length == 0 && candidate.Query.Length == 0 && candidate.Fragment.Length == 0;

    private static bool IsOwnedTemporaryName(string name, string dealershipId)
    {
        var prefix = $"temp/{dealershipId}/";
        if (!name.StartsWith(prefix, StringComparison.Ordinal)) return false;
        var fileName = name[prefix.Length..];
        return !fileName.Contains('/') && Path.GetExtension(fileName) is ".jpg" or ".png" or ".webp" &&
            Guid.TryParse(Path.GetFileNameWithoutExtension(fileName), out _);
    }

    private static void ValidateBlobId(string id)
    {
        VehicleStorageService.ValidateKey(id, "Identificador de imagen");
        if (id.Any(c => c is '%' or '|' or ':'))
            throw new ApiException(400, "invalid_image_id", "El identificador de la imagen contiene caracteres no permitidos.");
    }
}
