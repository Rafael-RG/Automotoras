using AutomotorasApi.Models;
using AutomotorasApi.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using System.Text.Json;

namespace AutomotorasApi.Functions;

public class DealershipFunctions(
    DealershipStorageService dealershipService,
    IRequestAuthorizer authorizer)
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

    // GET /api/account/dealerships -- only the authenticated account's root and branches.
    [Function("GetAdminDealerships")]
    public async Task<IActionResult> GetAdminDealerships(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "account/dealerships")] HttpRequest req)
    {
        var user = await authorizer.RequireUserAsync(req);
        var dealerships = (await dealershipService.GetByOwnerAccountIdAsync(user.AccountId)).ToList();
        var account = dealerships.FirstOrDefault(dealership =>
            string.Equals(dealership.RowKey, user.AccountId, StringComparison.Ordinal) &&
            string.Equals(DealershipStorageService.GetAccountId(dealership), user.AccountId, StringComparison.Ordinal));

        if (account is null)
            throw new ApiException(404, "account_not_found", "La cuenta de la sesiÃ³n ya no existe.");

        return new OkObjectResult(dealerships
            .Where(dealership => string.Equals(DealershipStorageService.GetAccountId(dealership), user.AccountId,
                StringComparison.Ordinal))
            .Select(dealership => DealershipStorageService.ToAdminDto(dealership, account)));
    }

    // POST /api/dealerships
    [Function("CreateDealership")]
    public async Task<IActionResult> CreateDealership(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "dealerships")] HttpRequest req)
    {
        // RequireUserAsync validates the session and CSRF for unsafe methods.
        // The owner is always derived from the server session.
        var user = await authorizer.RequireUserAsync(req);

        var body = await new StreamReader(req.Body).ReadToEndAsync();
        var request = JsonSerializer.Deserialize<CreateDealershipRequest>(body, JsonOptions);
        if (request is null) return new BadRequestObjectResult("Cuerpo de solicitud inválido.");

        var entity = await dealershipService.CreateBranchAsync(user.AccountId, request);
        var account = await dealershipService.GetByIdAsync(user.AccountId);
        if (account is null)
            throw new ApiException(404, "account_not_found", "La cuenta propietaria ya no existe.");
        return new CreatedResult($"/api/dealerships/{entity.RowKey}", DealershipStorageService.ToAdminDto(entity, account));
    }

    // PUT /api/dealerships/{id}
    [Function("UpdateDealership")]
    public async Task<IActionResult> UpdateDealership(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "dealerships/{id}")] HttpRequest req,
        string id)
    {
        // Authorize before consuming the request body and keep account login
        // data outside the profile-update DTO.
        await authorizer.RequireDealershipAsync(req, id, requireActivePlan: false);

        var body = await new StreamReader(req.Body).ReadToEndAsync();
        var request = JsonSerializer.Deserialize<UpdateDealershipRequest>(body, JsonOptions);
        if (request is null) return new BadRequestObjectResult("Cuerpo de solicitud inválido.");

        var entity = await dealershipService.UpdateAsync(id, request);
        if (entity is null) return new NotFoundResult();
        var account = await dealershipService.GetByIdAsync(DealershipStorageService.GetAccountId(entity));
        if (account is null)
            throw new ApiException(404, "account_not_found", "La cuenta propietaria ya no existe.");
        return new OkObjectResult(DealershipStorageService.ToAdminDto(entity, account));
    }

    // POST /api/dealerships/{id}/visit
    [Function("TrackDealershipVisit")]
    public async Task<IActionResult> TrackVisit(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "dealerships/{id}/visit")] HttpRequest req,
        string id)
    {
        await authorizer.RequireTrustedWriteAsync(req);
        await dealershipService.TrackProfileVisitAsync(id);
        return new OkResult();
    }
}
