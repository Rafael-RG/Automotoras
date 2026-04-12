using AutomotorasApi.Models;
using AutomotorasApi.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using System.Text.Json;

namespace AutomotorasApi.Functions;

public class DealershipFunctions(DealershipStorageService dealershipService)
{
    private static readonly JsonSerializerOptions JsonOptions =
        new() { PropertyNameCaseInsensitive = true };

    // GET /api/dealerships
    [Function("GetDealerships")]
    public async Task<IActionResult> GetDealerships(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "dealerships")] HttpRequest req)
    {
        var dealerships = await dealershipService.GetAllAsync();
        return new OkObjectResult(dealerships.Select(d => DealershipStorageService.ToDto(d)));
    }

    // GET /api/dealerships/{id}
    [Function("GetDealershipById")]
    public async Task<IActionResult> GetDealershipById(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "dealerships/{id}")] HttpRequest req,
        string id)
    {
        var dealership = await dealershipService.GetByIdAsync(id);
        return dealership is null ? new NotFoundResult() : new OkObjectResult(DealershipStorageService.ToDto(dealership));
    }

    // POST /api/dealerships
    [Function("CreateDealership")]
    public async Task<IActionResult> CreateDealership(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "dealerships")] HttpRequest req)
    {
        var body = await new StreamReader(req.Body).ReadToEndAsync();
        var request = JsonSerializer.Deserialize<CreateDealershipRequest>(body, JsonOptions);
        if (request is null) return new BadRequestObjectResult("Cuerpo de solicitud inválido.");

        var entity = await dealershipService.CreateAsync(request);
        return new CreatedResult($"/api/dealerships/{entity.RowKey}", DealershipStorageService.ToDto(entity));
    }

    // PUT /api/dealerships/{id}
    [Function("UpdateDealership")]
    public async Task<IActionResult> UpdateDealership(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "dealerships/{id}")] HttpRequest req,
        string id)
    {
        var body = await new StreamReader(req.Body).ReadToEndAsync();
        var request = JsonSerializer.Deserialize<UpdateDealershipRequest>(body, JsonOptions);
        if (request is null) return new BadRequestObjectResult("Cuerpo de solicitud inválido.");

        var entity = await dealershipService.UpdateAsync(id, request);
        return entity is null ? new NotFoundResult() : new OkObjectResult(DealershipStorageService.ToDto(entity));
    }
}
