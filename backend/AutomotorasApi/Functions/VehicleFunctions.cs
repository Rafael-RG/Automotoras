using AutomotorasApi.Models;
using AutomotorasApi.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using System.Text.Json;

namespace AutomotorasApi.Functions;

public class VehicleFunctions(VehicleStorageService vehicleService, BlobStorageService blobService)
{
    private static readonly JsonSerializerOptions JsonOptions =
        new() { PropertyNameCaseInsensitive = true };

    // GET /api/vehicles?brand=Porsche
    [Function("GetVehicles")]
    public async Task<IActionResult> GetVehicles(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "vehicles")] HttpRequest req)
    {
        var brand = req.Query["brand"].FirstOrDefault();
        var vehicles = await vehicleService.GetAllAsync(brand);
        return new OkObjectResult(vehicles.Select(vehicleService.ToDto));
    }

    // GET /api/vehicles/{brand}/{id}
    [Function("GetVehicleById")]
    public async Task<IActionResult> GetVehicleById(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "vehicles/{brand}/{id}")] HttpRequest req,
        string brand, string id)
    {
        var vehicle = await vehicleService.GetByIdAsync(brand, id);
        return vehicle is null ? new NotFoundResult() : new OkObjectResult(vehicleService.ToDto(vehicle));
    }

    // POST /api/vehicles
    [Function("CreateVehicle")]
    public async Task<IActionResult> CreateVehicle(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "vehicles")] HttpRequest req)
    {
        var body = await new StreamReader(req.Body).ReadToEndAsync();
        var request = JsonSerializer.Deserialize<CreateVehicleRequest>(body, JsonOptions);
        if (request is null) return new BadRequestObjectResult("Cuerpo de solicitud inválido.");

        var entity = await vehicleService.CreateAsync(request);
        return new CreatedResult($"/api/vehicles/{entity.Brand}/{entity.RowKey}", vehicleService.ToDto(entity));
    }

    // PUT /api/vehicles/{brand}/{id}
    [Function("UpdateVehicle")]
    public async Task<IActionResult> UpdateVehicle(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "vehicles/{brand}/{id}")] HttpRequest req,
        string brand, string id)
    {
        var body = await new StreamReader(req.Body).ReadToEndAsync();
        var request = JsonSerializer.Deserialize<CreateVehicleRequest>(body, JsonOptions);
        if (request is null) return new BadRequestObjectResult("Cuerpo de solicitud inválido.");

        var entity = await vehicleService.UpdateAsync(brand, id, request);
        return entity is null ? new NotFoundResult() : new OkObjectResult(vehicleService.ToDto(entity));
    }

    // DELETE /api/vehicles/{brand}/{id}
    [Function("DeleteVehicle")]
    public async Task<IActionResult> DeleteVehicle(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "vehicles/{brand}/{id}")] HttpRequest req,
        string brand, string id)
    {
        // Delete blob images first
        var urls = await vehicleService.GetImageUrlsAsync(brand, id);
        foreach (var url in urls)
            await blobService.DeleteBlobByUrlAsync(url);

        var deleted = await vehicleService.DeleteAsync(brand, id);
        return deleted ? new NoContentResult() : new NotFoundResult();
    }

    // POST /api/vehicles/{brand}/{id}/event
    [Function("TrackVehicleEvent")]
    public async Task<IActionResult> TrackVehicleEvent(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "vehicles/{brand}/{id}/event")] HttpRequest req,
        string brand, string id)
    {
        var body = await new StreamReader(req.Body).ReadToEndAsync();
        var request = JsonSerializer.Deserialize<TrackEventRequest>(body, JsonOptions);
        if (request is null || string.IsNullOrEmpty(request.Type))
            return new BadRequestObjectResult("Tipo de evento requerido: view, lead, share.");

        var ok = await vehicleService.IncrementEventAsync(brand, id, request.Type);
        return ok ? new OkResult() : new NotFoundResult();
    }

    // POST /api/vehicles/images/temp
    // Upload image to blob BEFORE the vehicle record exists. Returns the blob URL.
    [Function("UploadTempVehicleImage")]
    public async Task<IActionResult> UploadTempVehicleImage(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "vehicles/images/temp")] HttpRequest req)
    {
        IFormFile? file;
        try
        {
            var form = await req.ReadFormAsync();
            file = form.Files.GetFile("file");
        }
        catch
        {
            return new BadRequestObjectResult("No se pudo leer el formulario.");
        }

        if (file is null || file.Length == 0)
            return new BadRequestObjectResult("No se recibió ningún archivo.");

        var allowedTypes = new[] { "image/jpeg", "image/png", "image/webp" };
        if (!allowedTypes.Contains(file.ContentType))
            return new BadRequestObjectResult("Tipo de archivo no permitido. Usá JPG, PNG o WEBP.");

        if (file.Length > 5 * 1024 * 1024)
            return new BadRequestObjectResult("El archivo supera el límite de 5 MB.");

        using var stream = file.OpenReadStream();
        // Use "temp" as vehicleId prefix — will be stored under temp/ in the container
        var imageUrl = await blobService.UploadVehicleImageAsync("temp", stream, file.ContentType);

        return new OkObjectResult(new UploadImageResponse(imageUrl));
    }

}
