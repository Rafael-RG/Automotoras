using AutomotorasApi.Models;
using AutomotorasApi.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using System.Text.Json;

namespace AutomotorasApi.Functions;

public class AuthFunctions(DealershipStorageService dealershipService, EmailService emailService)
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

        // Enviar email de verificación (no bloqueamos si falla)
        try
        {
            await emailService.SendVerificationEmailAsync(entity.Email, entity.Name, entity.EmailVerificationToken);
        }
        catch { /* log en producción */ }

        return new OkObjectResult(new { message = "Cuenta creada. Revisá tu email para verificar tu cuenta." });
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

        if (!dealership.IsEmailVerified)
            return new ObjectResult(new { error = "EMAIL_NOT_VERIFIED" }) { StatusCode = 403 };

        return new OkObjectResult(new AuthResponse(
            dealership.RowKey, dealership.Name, dealership.Email, dealership.Plan, dealership.SubscriptionStatus));
    }

    // GET /api/auth/verify-email?token=xxx
    [Function("VerifyEmail")]
    public async Task<IActionResult> VerifyEmail(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "auth/verify-email")] HttpRequest req)
    {
        var token = req.Query["token"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(token))
            return new BadRequestObjectResult(new { error = "Token requerido." });

        var success = await dealershipService.VerifyEmailTokenAsync(token);
        if (!success)
            return new BadRequestObjectResult(new { error = "Token inválido o expirado." });

        return new OkObjectResult(new { message = "Email verificado correctamente. Ya podés iniciar sesión." });
    }

    // POST /api/auth/forgot-password
    [Function("ForgotPassword")]
    public async Task<IActionResult> ForgotPassword(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "auth/forgot-password")] HttpRequest req)
    {
        var body = await new StreamReader(req.Body).ReadToEndAsync();
        var request = JsonSerializer.Deserialize<ForgotPasswordRequest>(body, JsonOptions);

        if (request is null || string.IsNullOrWhiteSpace(request.Email))
            return new BadRequestObjectResult(new { error = "Email requerido." });

        // Siempre devolvemos OK para no revelar si el email existe
        var entity = await dealershipService.SetPasswordResetTokenAsync(request.Email);
        if (entity is not null)
        {
            try
            {
                await emailService.SendPasswordResetEmailAsync(entity.Email, entity.Name, entity.PasswordResetToken);
            }
            catch { /* log en producción */ }
        }

        return new OkObjectResult(new { message = "Si ese email está registrado y verificado, recibirás un link para restablecer tu contraseña." });
    }

    // POST /api/auth/reset-password
    [Function("ResetPassword")]
    public async Task<IActionResult> ResetPassword(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "auth/reset-password")] HttpRequest req)
    {
        var body = await new StreamReader(req.Body).ReadToEndAsync();
        var request = JsonSerializer.Deserialize<ResetPasswordRequest>(body, JsonOptions);

        if (request is null || string.IsNullOrWhiteSpace(request.Token) || string.IsNullOrWhiteSpace(request.NewPassword))
            return new BadRequestObjectResult(new { error = "Token y nueva contraseña son requeridos." });

        if (request.NewPassword.Length < 6)
            return new BadRequestObjectResult(new { error = "La contraseña debe tener al menos 6 caracteres." });

        var success = await dealershipService.ResetPasswordAsync(request.Token, request.NewPassword);
        if (!success)
            return new BadRequestObjectResult(new { error = "El link expiró o no es válido. Solicitá uno nuevo." });

        return new OkObjectResult(new { message = "Contraseña actualizada correctamente. Ya podés iniciar sesión." });
    }
}

