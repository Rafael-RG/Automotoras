using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
namespace AutomotorasApi.Services;

public class BlobStorageService
{
    private readonly BlobServiceClient _blobServiceClient;
    private const string VehicleImagesContainer = "vehicle-images";
    private const string DealershipLogosContainer = "dealership-logos";

    public BlobStorageService(BlobServiceClient blobServiceClient)
    {
        _blobServiceClient = blobServiceClient;
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
        _ => ".jpg"
    };

    public async Task<string> UploadVehicleImageAsync(string vehicleId, Stream imageStream, string contentType)
    {
        var container = await GetContainerAsync(VehicleImagesContainer);
        var blobName = $"{vehicleId}/{Guid.NewGuid()}{GetExtension(contentType)}";
        var blob = container.GetBlobClient(blobName);
        await blob.UploadAsync(imageStream, new BlobUploadOptions { HttpHeaders = new BlobHttpHeaders { ContentType = contentType } });
        return blob.Uri.ToString();
    }

    public async Task<string> UploadDealershipLogoAsync(string dealershipId, Stream imageStream, string contentType)
    {
        var container = await GetContainerAsync(DealershipLogosContainer);
        var blobName = $"{dealershipId}{GetExtension(contentType)}";
        var blob = container.GetBlobClient(blobName);
        await blob.UploadAsync(imageStream, new BlobUploadOptions { HttpHeaders = new BlobHttpHeaders { ContentType = contentType } });
        return blob.Uri.ToString();
    }
}
