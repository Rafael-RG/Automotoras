using AutomotorasApi.Services;
using Azure;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;

namespace AutomotorasApi.Functions;

public class ImageFunctions(
    BlobStorageService blobService,
    VehicleStorageService vehicleService,
    DealershipStorageService dealershipService,
    AdStorageService adService,
    IRequestAuthorizer authorizer,
    ImageValidationService imageValidation)
{
    // POST /api/vehicles/{brand}/{id}/image  (multipart/form-data, campo: "file")
    [Function("UploadVehicleImage")]
    public async Task<IActionResult> UploadVehicleImage(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "vehicles/{brand}/{id}/image")] HttpRequest req,
        string brand, string id)
    {
        await authorizer.RequireUserAsync(req);
        var vehicle = await vehicleService.GetByIdAsync(brand, id);
        if (vehicle is null) return new NotFoundResult();
        await authorizer.RequireDealershipAsync(req, vehicle.DealershipId, requireActivePlan: true);

        if (VehicleStorageService.ParseImageUrls(vehicle).Length >= VehicleStorageService.MaxImagesPerVehicle)
            throw VehicleStorageService.ImageLimitExceeded();
        var image = await imageValidation.ReadUploadAsync(req);
        using var stream = image.OpenReadStream();
        var url = await blobService.UploadVehicleImageAsync(id, stream, image.ContentType);
        await CommitImageAsync(url, BlobStorageService.VehicleImagesContainer,
            () => vehicleService.AddImageUrlAsync(brand, id, url, vehicle.DealershipId));

        return new OkObjectResult(new { url });
    }

    // DELETE /api/vehicles/{brand}/{id}/image?url=...
    [Function("RemoveVehicleImage")]
    public async Task<IActionResult> RemoveVehicleImage(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "vehicles/{brand}/{id}/image")] HttpRequest req,
        string brand, string id)
    {
        await authorizer.RequireUserAsync(req);
        var vehicle = await vehicleService.GetByIdAsync(brand, id);
        if (vehicle is null) return new NotFoundResult();
        await authorizer.RequireDealershipAsync(req, vehicle.DealershipId, requireActivePlan: true);

        var imageUrl = req.Query["url"].FirstOrDefault();
        if (string.IsNullOrEmpty(imageUrl))
            throw new ApiException(400, "image_url_required", "Parámetro 'url' requerido.");

        // Resolve only an exact persisted reference, never an arbitrary client-supplied blob URL.
        var persistedUrl = VehicleStorageService.ParseImageUrls(vehicle)
            .FirstOrDefault(url => string.Equals(url, imageUrl, StringComparison.Ordinal));
        if (persistedUrl is null || !blobService.IsPersistedVehicleImageUrl(vehicle, persistedUrl))
            throw new ApiException(400, "image_not_associated", "La imagen no pertenece a este vehículo o no es una imagen administrada.");

        var ok = await vehicleService.RemoveImageUrlAsync(brand, id, persistedUrl, vehicle.DealershipId);
        if (!ok) return new NotFoundResult();

        await blobService.DeleteBlobByUrlAsync(persistedUrl, BlobStorageService.VehicleImagesContainer);

        return new NoContentResult();
    }

    // POST /api/dealerships/{id}/logo  (multipart/form-data, campo: "file")
    [Function("UploadDealershipLogo")]
    public async Task<IActionResult> UploadDealershipLogo(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "dealerships/{id}/logo")] HttpRequest req,
        string id)
    {
        // The authorizer confirms existence, ownership and the root account's active plan.
        await authorizer.RequireDealershipAsync(req, id, requireActivePlan: true);
        var image = await imageValidation.ReadUploadAsync(req);
        using var stream = image.OpenReadStream();
        var url = await blobService.UploadDealershipLogoAsync(id, stream, image.ContentType);
        await CommitImageAsync(url, BlobStorageService.DealershipLogosContainer,
            () => dealershipService.UpdateLogoUrlAsync(id, url));

        return new OkObjectResult(new { url });
    }

    // POST /api/ads/{id}/image — requiere sesión de administrador de plataforma y CSRF.
    [Function("UploadAdImage")]
    public async Task<IActionResult> UploadAdImage(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "ads/{id}/image")] HttpRequest req,
        string id)
    {
        await authorizer.RequirePlatformAdminAsync(req);
        VehicleStorageService.ValidateKey(id, "Anuncio");
        var ad = await adService.GetByIdAsync(id);
        if (ad is null) return new NotFoundResult();

        var image = await imageValidation.ReadUploadAsync(req);
        using var stream = image.OpenReadStream();
        var url = await blobService.UploadAdImageAsync(id, stream, image.ContentType);
        await CommitImageAsync(url, BlobStorageService.AdBannersContainer,
            () => adService.UpdateImageUrlAsync(id, url));

        return new OkObjectResult(new { url });
    }

    private async Task CommitImageAsync(string url, string container, Func<Task<bool>> saveMetadata)
    {
        try
        {
            if (!await saveMetadata())
                throw new ApiException(404, "image_target_not_found", "El registro ya no existe. No se guardó la imagen.");
        }
        catch (RequestFailedException ex) when (ex.Status == 412)
        {
            await blobService.CleanupFailedUploadAsync(url, container);
            throw TableRetry.Conflict();
        }
        catch
        {
            await blobService.CleanupFailedUploadAsync(url, container);
            throw;
        }
    }
}
