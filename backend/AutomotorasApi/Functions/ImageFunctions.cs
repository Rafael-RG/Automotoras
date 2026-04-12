using AutomotorasApi.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;

namespace AutomotorasApi.Functions;

public class ImageFunctions(
    BlobStorageService blobService,
    VehicleStorageService vehicleService,
    DealershipStorageService dealershipService)
{
    private static readonly string[] AllowedTypes = ["image/jpeg", "image/png", "image/webp"];

    private const int MaxImagesPerVehicle = 10;

    // POST /api/vehicles/{brand}/{id}/image  (multipart/form-data, campo: "file")
    [Function("UploadVehicleImage")]
    public async Task<IActionResult> UploadVehicleImage(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "vehicles/{brand}/{id}/image")] HttpRequest req,
        string brand, string id)
    {
        if (!req.HasFormContentType || req.Form.Files.Count == 0)
            return new BadRequestObjectResult("Se requiere un archivo en el campo 'file'.");

        var file = req.Form.Files[0];

        if (!AllowedTypes.Contains(file.ContentType))
            return new BadRequestObjectResult("Solo se permiten imágenes JPEG, PNG o WebP.");

        if (file.Length > 10 * 1024 * 1024)
            return new BadRequestObjectResult("El archivo supera el límite de 10 MB.");

        var vehicle = await vehicleService.GetByIdAsync(brand, id);
        if (vehicle is null) return new NotFoundResult();

        var currentCount = string.IsNullOrEmpty(vehicle.ImageUrlsJson)
            ? (string.IsNullOrEmpty(vehicle.ImageUrl) ? 0 : 1)
            : vehicle.ImageUrlsJson.Split('|', StringSplitOptions.RemoveEmptyEntries).Length;

        if (currentCount >= MaxImagesPerVehicle)
            return new BadRequestObjectResult($"Límite de {MaxImagesPerVehicle} imágenes por vehículo alcanzado.");

        using var stream = file.OpenReadStream();
        var url = await blobService.UploadVehicleImageAsync(id, stream, file.ContentType);
        await vehicleService.AddImageUrlAsync(brand, id, url);

        return new OkObjectResult(new { url });
    }

    // DELETE /api/vehicles/{brand}/{id}/image?url=...
    [Function("RemoveVehicleImage")]
    public async Task<IActionResult> RemoveVehicleImage(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "vehicles/{brand}/{id}/image")] HttpRequest req,
        string brand, string id)
    {
        var imageUrl = req.Query["url"].FirstOrDefault();
        if (string.IsNullOrEmpty(imageUrl))
            return new BadRequestObjectResult("Parámetro 'url' requerido.");

        var ok = await vehicleService.RemoveImageUrlAsync(brand, id, imageUrl);
        return ok ? new NoContentResult() : new NotFoundResult();
    }

    // POST /api/dealerships/{id}/logo  (multipart/form-data, campo: "file")
    [Function("UploadDealershipLogo")]
    public async Task<IActionResult> UploadDealershipLogo(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "dealerships/{id}/logo")] HttpRequest req,
        string id)
    {
        if (!req.HasFormContentType || req.Form.Files.Count == 0)
            return new BadRequestObjectResult("Se requiere un archivo en el campo 'file'.");

        var file = req.Form.Files[0];

        if (!AllowedTypes.Contains(file.ContentType))
            return new BadRequestObjectResult("Solo se permiten imágenes JPEG, PNG o WebP.");

        if (file.Length > 5 * 1024 * 1024)
            return new BadRequestObjectResult("El archivo supera el límite de 5 MB.");

        using var stream = file.OpenReadStream();
        var url = await blobService.UploadDealershipLogoAsync(id, stream, file.ContentType);
        await dealershipService.UpdateLogoUrlAsync(id, url);

        return new OkObjectResult(new { url });
    }
}
