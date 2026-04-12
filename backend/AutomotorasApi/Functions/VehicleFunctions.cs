using AutomotorasApi.Models;
using AutomotorasApi.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using System.Text.Json;

namespace AutomotorasApi.Functions;

public class VehicleFunctions(VehicleStorageService vehicleService)
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
}
