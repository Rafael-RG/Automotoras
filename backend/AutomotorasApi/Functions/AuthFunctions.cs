using AutomotorasApi.Models;
using AutomotorasApi.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using System.Text.Json;

namespace AutomotorasApi.Functions;

public class AuthFunctions(DealershipStorageService dealershipService)
{
    private static readonly JsonSerializerOptions JsonOptions =
        new() { PropertyNameCaseInsensitive = true };

    // POST /api/auth/register
    [Function("Register")]
    public async Task<IActionResult> Register(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "auth/register")] HttpRequest req)
    {
        var body = await new StreamReader(req.Body).ReadToEndAsync();
        var request = JsonSerializer.Deserialize<RegisterRequest>(body, JsonOptions);

        if (request is null || string.IsNullOrWhiteSpace(request.Email) ||
            string.IsNullOrWhiteSpace(request.Password) || string.IsNullOrWhiteSpace(request.Name))
            return new BadRequestObjectResult(new { error = "Nombre, email y contraseña son requeridos." });

        if (request.Password.Length < 6)
            return new BadRequestObjectResult(new { error = "La contraseña debe tener al menos 6 caracteres." });

        var (entity, emailExists) = await dealershipService.RegisterWithCredentialsAsync(request);

        if (emailExists)
            return new ConflictObjectResult(new { error = "Ya existe una cuenta con ese email." });

        return new OkObjectResult(new AuthResponse(
            entity.RowKey, entity.Name, entity.Email, entity.Plan, entity.SubscriptionStatus));
    }

    // POST /api/auth/login
    [Function("Login")]
    public async Task<IActionResult> Login(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "auth/login")] HttpRequest req)
    {
        var body = await new StreamReader(req.Body).ReadToEndAsync();
        var request = JsonSerializer.Deserialize<LoginRequest>(body, JsonOptions);

        if (request is null || string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            return new BadRequestObjectResult(new { error = "Email y contraseña son requeridos." });

        var dealership = await dealershipService.GetByEmailAsync(request.Email);

        if (dealership is null || string.IsNullOrEmpty(dealership.PasswordHash))
            return new UnauthorizedObjectResult(new { error = "Credenciales incorrectas." });

        if (!DealershipStorageService.VerifyPassword(request.Password, dealership.PasswordHash, dealership.PasswordSalt))
            return new UnauthorizedObjectResult(new { error = "Credenciales incorrectas." });

        return new OkObjectResult(new AuthResponse(
            dealership.RowKey, dealership.Name, dealership.Email, dealership.Plan, dealership.SubscriptionStatus));
    }
}
