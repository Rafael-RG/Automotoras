using AutomotorasApi.Models;
using AutomotorasApi.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using System.Text.Json;

namespace AutomotorasApi.Functions;

public class AdFunctions(AdStorageService adService, IRequestAuthorizer authorizer)
{
    private static readonly JsonSerializerOptions JsonOptions =
        new() { PropertyNameCaseInsensitive = true };

    // GET /api/ads/active — público, usado por el frontend para mostrar los banners vigentes
    [Function("GetActiveAds")]
    public async Task<IActionResult> GetActiveAds(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "ads/active")] HttpRequest req)
    {
        var ads = await adService.GetActiveAsync();
        return new OkObjectResult(ads.Select(AdStorageService.ToDto));
    }

    // GET /api/ads — requiere sesión de administrador de plataforma.
    [Function("GetAds")]
    public async Task<IActionResult> GetAds(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "ads")] HttpRequest req)
    {
        await authorizer.RequirePlatformAdminAsync(req);

        var ads = await adService.GetAllAsync();
        return new OkObjectResult(ads.Select(AdStorageService.ToDto));
    }

    // GET /api/ads/{id} — requiere sesión de administrador de plataforma.
    [Function("GetAdById")]
    public async Task<IActionResult> GetAdById(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "ads/{id}")] HttpRequest req,
        string id)
    {
        await authorizer.RequirePlatformAdminAsync(req);

        var ad = await adService.GetByIdAsync(id);
        return ad is null ? new NotFoundResult() : new OkObjectResult(AdStorageService.ToDto(ad));
    }

    // POST /api/ads — requiere sesión de administrador de plataforma y CSRF.
    [Function("CreateAd")]
    public async Task<IActionResult> CreateAd(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "ads")] HttpRequest req)
    {
        await authorizer.RequirePlatformAdminAsync(req);

        var body = await new StreamReader(req.Body).ReadToEndAsync();
        var request = JsonSerializer.Deserialize<CreateAdRequest>(body, JsonOptions);
        if (request is null) return new BadRequestObjectResult("Cuerpo de solicitud inválido.");

        var entity = await adService.CreateAsync(request);
        return new CreatedResult($"/api/ads/{entity.RowKey}", AdStorageService.ToDto(entity));
    }

    // PUT /api/ads/{id} — requiere sesión de administrador de plataforma y CSRF.
    [Function("UpdateAd")]
    public async Task<IActionResult> UpdateAd(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "ads/{id}")] HttpRequest req,
        string id)
    {
        await authorizer.RequirePlatformAdminAsync(req);

        var body = await new StreamReader(req.Body).ReadToEndAsync();
        var request = JsonSerializer.Deserialize<UpdateAdRequest>(body, JsonOptions);
        if (request is null) return new BadRequestObjectResult("Cuerpo de solicitud inválido.");

        var entity = await adService.UpdateAsync(id, request);
        return entity is null ? new NotFoundResult() : new OkObjectResult(AdStorageService.ToDto(entity));
    }

    // DELETE /api/ads/{id} — requiere sesión de administrador de plataforma y CSRF.
    [Function("DeleteAd")]
    public async Task<IActionResult> DeleteAd(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "ads/{id}")] HttpRequest req,
        string id)
    {
        await authorizer.RequirePlatformAdminAsync(req);

        var ok = await adService.DeleteAsync(id);
        return ok ? new NoContentResult() : new NotFoundResult();
    }
}
