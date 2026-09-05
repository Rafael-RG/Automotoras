using AutomotorasApi.Models;
using AutomotorasApi.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using System.Text.Json;

namespace AutomotorasApi.Functions;

public class VehicleFunctions(
    VehicleStorageService vehicleService,
    BlobStorageService blobService,
    IRequestAuthorizer authorizer,
    ImageValidationService imageValidation)
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

    // GET /api/dealership/{dealershipId}/vehicles  — devuelve datos completos incluyendo matrícula y padrón
    [Function("GetDealershipVehicles")]
    public async Task<IActionResult> GetDealershipVehicles(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "dealership/{dealershipId}/vehicles")] HttpRequest req,
        string dealershipId)
    {
        await authorizer.RequireDealershipAsync(req, dealershipId, requireActivePlan: false);
        var vehicles = await vehicleService.GetByDealershipAsync(dealershipId);
        return new OkObjectResult(vehicles.Select(vehicleService.ToDealershipDto));
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
        await authorizer.RequireUserAsync(req);
        var request = await ReadRequestAsync<CreateVehicleRequest>(req);
        VehicleStorageService.ValidateRequest(request);
        await authorizer.RequireDealershipAsync(req, request.DealershipId, requireActivePlan: true);
        await blobService.ValidateVehicleImageUrlsAsync(
            VehicleStorageService.GetRequestedImageUrls(request), request.DealershipId);

        var entity = await vehicleService.CreateAsync(request);
        return new CreatedResult($"/api/vehicles/{Uri.EscapeDataString(entity.Brand)}/{Uri.EscapeDataString(entity.RowKey)}",
            vehicleService.ToDto(entity));
    }

    // PUT /api/vehicles/{brand}/{id}
    [Function("UpdateVehicle")]
    public async Task<IActionResult> UpdateVehicle(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "vehicles/{brand}/{id}")] HttpRequest req,
        string brand, string id)
    {
        await authorizer.RequireUserAsync(req);
        var existing = await vehicleService.GetByIdAsync(brand, id);
        if (existing is null) return new NotFoundResult();
        await authorizer.RequireDealershipAsync(req, existing.DealershipId, requireActivePlan: true);

        var request = await ReadRequestAsync<CreateVehicleRequest>(req);
        VehicleStorageService.ValidateRequest(request);
        if (!string.Equals(existing.DealershipId, request.DealershipId, StringComparison.Ordinal))
            await authorizer.RequireDealershipAsync(req, request.DealershipId, requireActivePlan: true);
        await blobService.ValidateVehicleImageUrlsAsync(
            VehicleStorageService.GetRequestedImageUrls(request), request.DealershipId, existing);

        var entity = await vehicleService.UpdateAsync(existing, request);
        return new OkObjectResult(vehicleService.ToDto(entity));
    }

    // DELETE /api/vehicles/{brand}/{id}
    [Function("DeleteVehicle")]
    public async Task<IActionResult> DeleteVehicle(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "vehicles/{brand}/{id}")] HttpRequest req,
        string brand, string id)
    {
        await authorizer.RequireUserAsync(req);
        var existing = await vehicleService.GetByIdAsync(brand, id);
        if (existing is null) return new NotFoundResult();
        await authorizer.RequireDealershipAsync(req, existing.DealershipId, requireActivePlan: true);

        // Commit the conditional table delete first. A conflict must not delete live images.
        var urls = VehicleStorageService.ParseImageUrls(existing)
            .Where(url => blobService.IsPersistedVehicleImageUrl(existing, url)).ToArray();
        if (!await vehicleService.DeleteAsync(existing)) return new NotFoundResult();
        foreach (var url in urls)
            await blobService.DeleteBlobByUrlAsync(url, BlobStorageService.VehicleImagesContainer);
        return new NoContentResult();
    }

    // POST /api/vehicles/{brand}/{id}/event
    [Function("TrackVehicleEvent")]
    public async Task<IActionResult> TrackVehicleEvent(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "vehicles/{brand}/{id}/event")] HttpRequest req,
        string brand, string id)
    {
        await authorizer.RequireTrustedWriteAsync(req);
        var request = await ReadRequestAsync<TrackEventRequest>(req, maxBytes: 1024);
        if (request.Type?.ToLowerInvariant() is not ("view" or "lead" or "share"))
            throw new ApiException(400, "invalid_vehicle_event", "Tipo de evento requerido: view, lead, share.");

        var ok = await vehicleService.IncrementEventAsync(brand, id, request.Type);
        return ok ? new NoContentResult() : new NotFoundResult();
    }

    // POST /api/vehicles/images/temp
    // Multipart order: dealershipId, file. Authentication precedes any body processing.
    [Function("UploadTempVehicleImage")]
    public async Task<IActionResult> UploadTempVehicleImage(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "vehicles/images/temp")] HttpRequest req)
    {
        await authorizer.RequireUserAsync(req);
        var upload = await imageValidation.ReadTemporaryUploadAsync(req, async dealershipId =>
        {
            await authorizer.RequireDealershipAsync(req, dealershipId, requireActivePlan: true);
        });
        using var stream = upload.Image.OpenReadStream();
        var imageUrl = await blobService.UploadTemporaryVehicleImageAsync(
            upload.DealershipId, stream, upload.Image.ContentType);

        return new OkObjectResult(new UploadImageResponse(imageUrl));
    }

    private static async Task<T> ReadRequestAsync<T>(HttpRequest req, int maxBytes = 128 * 1024) where T : class
    {
        if (req.ContentLength > maxBytes)
            throw new ApiException(413, "request_too_large", "La solicitud supera el tamaño permitido.");
        using var body = new MemoryStream();
        var buffer = new byte[8192];
        while (true)
        {
            var count = (int)Math.Min(buffer.Length, maxBytes + 1L - body.Length);
            var read = await req.Body.ReadAsync(buffer.AsMemory(0, count), req.HttpContext.RequestAborted);
            if (read == 0) break;
            if (body.Length + read > maxBytes)
                throw new ApiException(413, "request_too_large", "La solicitud supera el tamaño permitido.");
            await body.WriteAsync(buffer.AsMemory(0, read), req.HttpContext.RequestAborted);
        }
        try
        {
            return JsonSerializer.Deserialize<T>(body.ToArray(), JsonOptions)
                ?? throw new ApiException(400, "invalid_request", "Cuerpo de solicitud inválido.");
        }
        catch (JsonException)
        {
            throw new ApiException(400, "invalid_request", "El cuerpo debe ser JSON válido con los campos y tipos requeridos.");
        }
    }
}
