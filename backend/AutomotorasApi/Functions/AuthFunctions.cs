using System.Net.Mail;
using System.Text.Json;
using AutomotorasApi.Models;
using AutomotorasApi.Services;
using Azure;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace AutomotorasApi.Functions;

/// <summary>
/// Account authentication endpoints. The browser receives an HttpOnly opaque
/// session cookie; it never receives a password hash, an access token, or a
/// long-lived credential suitable for localStorage.
/// </summary>
public class AuthFunctions(
    DealershipStorageService dealershipService,
    EmailService emailService,
    SessionStorageService sessionStorage,
    IRequestAuthorizer authorizer,
    IConfiguration configuration,
    ILogger<AuthFunctions> logger)
{
    private const int MaximumBodyBytes = 16 * 1024;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        MaxDepth = 8,
    };

    // POST /api/auth/register
    [Function("Register")]
    public async Task<IActionResult> Register(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "auth/register")] HttpRequest req)
    {
        await authorizer.RequireTrustedWriteAsync(req);
        var request = await ReadRequestAsync<RegisterRequest>(req);
        ValidateRegistration(request);

        DealershipEntity entity;
        try
        {
            var result = await dealershipService.RegisterWithCredentialsAsync(request);
            if (result.emailExists)
                throw new ApiException(409, "email_already_registered", "Ya existe una cuenta con ese email.");
            entity = result.entity;
        }
        catch (RequestFailedException exception) when (exception.Status == 409)
        {
            // A concurrent registration must not turn into a generic 500.
            throw new ApiException(409, "email_already_registered", "Ya existe una cuenta con ese email.");
        }

        var delivered = await TrySendVerificationAsync(entity);
        return new ObjectResult(new
        {
            message = delivered
                ? "Cuenta creada. Revisá tu email para verificarla."
                : "La cuenta fue creada, pero no pudimos enviar el email de verificación. Solicitá un reenvío.",
            emailDelivery = delivered ? "sent" : "pending",
        }) { StatusCode = delivered ? StatusCodes.Status201Created : StatusCodes.Status202Accepted };
    }

    // POST /api/auth/login
    [Function("Login")]
    public async Task<IActionResult> Login(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "auth/login")] HttpRequest req)
    {
        // If a valid cookie is already present this also requires its CSRF token,
        // preventing a cross-site request from switching the logged-in account.
        await authorizer.RequireTrustedWriteAsync(req);
        var request = await ReadRequestAsync<LoginRequest>(req);
        if (!IsValidEmail(request.Email) || string.IsNullOrEmpty(request.Password))
            throw InvalidCredentials();

        var account = await dealershipService.GetByLoginEmailAsync(request.Email);
        if (account is null || string.IsNullOrWhiteSpace(account.PasswordHash) ||
            !DealershipStorageService.VerifyPassword(request.Password, account.PasswordHash, account.PasswordSalt))
            throw InvalidCredentials();

        if (!account.IsEmailVerified)
            throw new ApiException(403, "EMAIL_NOT_VERIFIED", "Verificá tu email para continuar.");

        // Rotate any current session only after credentials have been validated.
        // This both prevents fixation and makes account switching deterministic.
        await sessionStorage.RevokeCurrentAsync(req, req.HttpContext.RequestAborted);
        var creation = await sessionStorage.CreateAsync(
            account.RowKey,
            PlatformAdministratorPolicy.IsConfigured(configuration, DealershipStorageService.GetLoginEmail(account)),
            req,
            account.CredentialVersion,
            req.HttpContext.RequestAborted);
        sessionStorage.AppendSessionCookie(req.HttpContext.Response, req, creation);
        return new OkObjectResult(BuildSessionResponse(account, sessionStorage.BuildSessionResponse(creation)));
    }

    // GET /api/auth/me
    [Function("GetCurrentSession")]
    public async Task<IActionResult> Me(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "auth/me")] HttpRequest req)
    {
        var context = await sessionStorage.GetAuthenticatedSessionAsync(req, req.HttpContext.RequestAborted);
        if (context is null)
        {
            sessionStorage.ExpireSessionCookie(req.HttpContext.Response, req);
            throw new ApiException(401, "session_required", "Iniciá sesión para continuar.");
        }

        // Re-check that the account still exists and is still the canonical root.
        // A session is not a durable authorization snapshot.
        var account = await dealershipService.GetByIdAsync(context.AccountId);
        if (account is null || !string.Equals(account.RowKey, context.AccountId, StringComparison.Ordinal) ||
            !string.Equals(DealershipStorageService.GetAccountId(account), context.AccountId, StringComparison.Ordinal) ||
            account.CredentialVersion != context.Session.CredentialVersion)
        {
            await sessionStorage.RevokeCurrentAsync(req, req.HttpContext.RequestAborted);
            sessionStorage.ExpireSessionCookie(req.HttpContext.Response, req);
            throw new ApiException(401, "session_required", "Iniciá sesión para continuar.");
        }

        var currentRole = PlatformAdministratorPolicy.IsConfigured(
            configuration, DealershipStorageService.GetLoginEmail(account));
        return new OkObjectResult(BuildSessionResponse(account, new SessionResponse(
            context.AccountId, currentRole, context.CsrfToken, context.ExpiresAt)));
    }

    // POST /api/auth/logout
    [Function("Logout")]
    public async Task<IActionResult> Logout(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "auth/logout")] HttpRequest req)
    {
        await authorizer.RequireUserAsync(req); // includes CSRF for POST
        await sessionStorage.RevokeCurrentAsync(req, req.HttpContext.RequestAborted);
        sessionStorage.ExpireSessionCookie(req.HttpContext.Response, req);
        return new NoContentResult();
    }

    // GET /api/auth/verify-email?token=xxx
    [Function("VerifyEmail")]
    public async Task<IActionResult> VerifyEmail(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "auth/verify-email")] HttpRequest req)
    {
        var token = req.Query["token"].FirstOrDefault();
        if (!IsSecureLinkToken(token))
            throw new ApiException(400, "verification_token_invalid", "El enlace de verificación no es válido o expiró.");

        var account = await dealershipService.VerifyEmailAndStartPasswordSetupAsync(token!);
        if (account is null)
            throw new ApiException(400, "verification_token_invalid", "El enlace de verificación no es válido o expiró.");

        // Unverified accounts normally have no sessions, but revoking any
        // legacy/session-race residue keeps the account boundary explicit.
        await sessionStorage.RevokeAccountSessionsAsync(account.RowKey, req.HttpContext.RequestAborted);
        return new OkObjectResult(new
        {
            message = "Email verificado correctamente. Elegí una contraseña para activar la cuenta.",
            passwordSetupRequired = true,
        });
    }

    // POST /api/auth/resend-verification
    [Function("ResendVerification")]
    public async Task<IActionResult> ResendVerification(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "auth/resend-verification")] HttpRequest req)
    {
        await authorizer.RequireTrustedWriteAsync(req);
        var request = await ReadRequestAsync<EmailRequest>(req);
        if (IsValidEmail(request.Email))
        {
            var account = await dealershipService.SetEmailVerificationTokenAsync(request.Email);
            if (account is not null)
                await TrySendVerificationAsync(account);
        }

        // Avoid account enumeration; a delivery failure is logged server-side and
        // can be safely retried by the user from the login screen.
        return new OkObjectResult(new { message = "Si la cuenta necesita verificación, recibirás un nuevo enlace por email." });
    }

    // POST /api/auth/forgot-password
    [Function("ForgotPassword")]
    public async Task<IActionResult> ForgotPassword(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "auth/forgot-password")] HttpRequest req)
    {
        await authorizer.RequireTrustedWriteAsync(req);
        var request = await ReadRequestAsync<ForgotPasswordRequest>(req);
        if (IsValidEmail(request.Email))
        {
            var account = await dealershipService.SetPasswordResetTokenAsync(request.Email);
            if (account is not null)
                await TrySendPasswordResetAsync(account);
        }

        return new OkObjectResult(new { message = "Si ese email está registrado y verificado, recibirás un enlace para restablecer tu contraseña." });
    }

    // POST /api/auth/reset-password
    [Function("ResetPassword")]
    public async Task<IActionResult> ResetPassword(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "auth/reset-password")] HttpRequest req)
    {
        await authorizer.RequireTrustedWriteAsync(req);
        var request = await ReadRequestAsync<ResetPasswordRequest>(req);
        if (!IsSecureLinkToken(request.Token) || !IsValidPassword(request.NewPassword))
            throw new ApiException(400, "password_reset_invalid", "El enlace o la nueva contraseña no son válidos.");

        var account = await dealershipService.ResetPasswordAndGetAccountAsync(request.Token, request.NewPassword);
        if (account is null)
            throw new ApiException(400, "password_reset_invalid", "El enlace expiró o no es válido.");

        // Existing sessions cannot survive a credential reset.
        await sessionStorage.RevokeAccountSessionsAsync(account.RowKey, req.HttpContext.RequestAborted);
        return new OkObjectResult(new { message = "Contraseña actualizada correctamente. Ya podés iniciar sesión." });
    }

    private async Task<bool> TrySendVerificationAsync(DealershipEntity account)
    {
        try
        {
            await emailService.SendVerificationEmailAsync(
                DealershipStorageService.GetLoginEmail(account), account.Name, account.EmailVerificationToken);
            return true;
        }
        catch (Exception exception)
        {
            // Do not include SMTP/provider details or recipient data in a client response.
            logger.LogWarning(exception, "No se pudo enviar un correo de verificación.");
            return false;
        }
    }

    private async Task<bool> TrySendPasswordResetAsync(DealershipEntity account)
    {
        try
        {
            await emailService.SendPasswordResetEmailAsync(
                DealershipStorageService.GetLoginEmail(account), account.Name, account.PasswordResetToken);
            return true;
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "No se pudo enviar un correo de restablecimiento.");
            return false;
        }
    }

    private static async Task<T> ReadRequestAsync<T>(HttpRequest req) where T : class
    {
        if (req.ContentLength > MaximumBodyBytes)
            throw new ApiException(413, "request_too_large", "La solicitud supera el tamaño permitido.");

        using var buffer = new MemoryStream();
        var bytes = new byte[4096];
        while (true)
        {
            var available = MaximumBodyBytes + 1L - buffer.Length;
            if (available <= 0)
                throw new ApiException(413, "request_too_large", "La solicitud supera el tamaño permitido.");
            var count = (int)Math.Min(bytes.Length, available);
            var read = await req.Body.ReadAsync(bytes.AsMemory(0, count), req.HttpContext.RequestAborted);
            if (read == 0) break;
            if (buffer.Length + read > MaximumBodyBytes)
                throw new ApiException(413, "request_too_large", "La solicitud supera el tamaño permitido.");
            await buffer.WriteAsync(bytes.AsMemory(0, read), req.HttpContext.RequestAborted);
        }

        try
        {
            return JsonSerializer.Deserialize<T>(buffer.ToArray(), JsonOptions)
                ?? throw new ApiException(400, "request_invalid", "El cuerpo de la solicitud no es válido.");
        }
        catch (JsonException)
        {
            throw new ApiException(400, "request_invalid", "El cuerpo de la solicitud no es válido.");
        }
    }

    private static void ValidateRegistration(RegisterRequest request)
    {
        if (!IsValidDisplayName(request.Name) ||
            !IsValidEmail(request.Email))
        {
            throw new ApiException(400, "registration_invalid",
                "Indicá nombre y email válidos. Vas a elegir tu contraseña después de verificar el email.");
        }
    }

    private static bool IsValidEmail(string? email)
    {
        if (string.IsNullOrWhiteSpace(email) || email.Length > 254 || email != email.Trim()) return false;
        return MailAddress.TryCreate(email, out var parsed) &&
            string.Equals(parsed.Address, email, StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsValidDisplayName(string? name) =>
        !string.IsNullOrWhiteSpace(name) && name.Length <= 160 && name == name.Trim() &&
        !name.Any(char.IsControl);

    private static bool IsValidPassword(string? password) =>
        password is { Length: >= 8 and <= 512 } && !password.Any(char.IsControl);

    private static bool IsSecureLinkToken(string? token) =>
        token is { Length: >= 40 and <= 128 } &&
        token.All(character => char.IsLetterOrDigit(character) || character is '-' or '_');

    private static ApiException InvalidCredentials() =>
        new(401, "invalid_credentials", "Email o contraseña incorrectos.");

    private static AuthSessionResponse BuildSessionResponse(DealershipEntity account, SessionResponse session) =>
        new(
            session.AccountId,
            account.RowKey,
            account.Name,
            DealershipStorageService.GetLoginEmail(account),
            account.Plan,
            account.SubscriptionStatus,
            session.IsPlatformAdmin,
            session.CsrfToken,
            session.ExpiresAt);

    private sealed record EmailRequest(string Email);

    // Matches src/services/api.js. The CSRF value is stripped before the client
    // stores the session object, leaving it only in the api module's memory.
    private sealed record AuthSessionResponse(
        string AccountId,
        string DealershipId,
        string Name,
        string Email,
        string Plan,
        string SubscriptionStatus,
        bool IsPlatformAdmin,
        string CsrfToken,
        DateTimeOffset ExpiresAt);
}
