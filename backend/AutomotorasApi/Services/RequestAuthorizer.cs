using AutomotorasApi.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Primitives;

namespace AutomotorasApi.Services;

/// <summary>
/// Authorization boundary used by HTTP functions.  Functions must authorize the
/// resolved server-side resource, never an account or dealership identifier sent
/// only by the browser.
/// </summary>
public interface IRequestAuthorizer
{
    Task<SessionUser> RequireUserAsync(HttpRequest request);

    Task<DealershipEntity> RequireDealershipAsync(
        HttpRequest request,
        string dealershipId,
        bool requireActivePlan);

    Task<SessionUser> RequirePlatformAdminAsync(HttpRequest request);

    /// <summary>
    /// Protects an anonymous auth write against cross-site form/login attacks. If
    /// the request already carries a valid session, a CSRF token is required.
    /// </summary>
    Task RequireTrustedWriteAsync(HttpRequest request);
}

public sealed class RequestAuthorizer : IRequestAuthorizer
{
    private readonly SessionStorageService _sessionStorage;
    private readonly DealershipStorageService _dealershipStorage;
    private readonly HashSet<string> _trustedOrigins;
    private readonly IConfiguration _configuration;

    public RequestAuthorizer(
        SessionStorageService sessionStorage,
        DealershipStorageService dealershipStorage,
        IConfiguration configuration)
    {
        _sessionStorage = sessionStorage ?? throw new ArgumentNullException(nameof(sessionStorage));
        _dealershipStorage = dealershipStorage ?? throw new ArgumentNullException(nameof(dealershipStorage));
        ArgumentNullException.ThrowIfNull(configuration);
        _configuration = configuration;
        _trustedOrigins = new HashSet<string>(TrustedOriginPolicy.ReadAllowedOrigins(configuration), StringComparer.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Validates the opaque session and, for unsafe methods, its CSRF header.
    /// Absence, expiry, revocation, and corruption all produce the same 401 so the
    /// caller cannot enumerate session state.
    /// </summary>
    public async Task<SessionUser> RequireUserAsync(HttpRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        var session = await _sessionStorage.GetSessionAsync(request, request.HttpContext.RequestAborted);
        if (session is null)
            throw new ApiException(401, "session_required", "IniciÃ¡ sesiÃ³n para continuar.");

        await EnsureCurrentCredentialVersionAsync(session);

        if (IsUnsafeMethod(request.Method) && !_sessionStorage.IsValidCsrfToken(request, session))
            throw CsrfFailed();

        return session.ToUser();
    }

    /// <summary>
    /// Requires a session whose root account owns the requested dealership.  A
    /// branch cannot be used to cross into a different account, even if its public
    /// ID is known.  Active-plan checks always inspect the root account.
    /// </summary>
    public async Task<DealershipEntity> RequireDealershipAsync(
        HttpRequest request,
        string dealershipId,
        bool requireActivePlan)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (string.IsNullOrWhiteSpace(dealershipId))
            throw new ApiException(400, "dealership_required", "La automotora es obligatoria.");

        var user = await RequireUserAsync(request);
        var dealership = await _dealershipStorage.GetByIdAsync(dealershipId);
        if (dealership is null)
            throw new ApiException(404, "dealership_not_found", "La automotora no existe.");

        var accountId = DealershipStorageService.GetAccountId(dealership);
        if (string.IsNullOrWhiteSpace(accountId) ||
            !string.Equals(accountId, user.AccountId, StringComparison.Ordinal))
            throw new ApiException(403, "dealership_forbidden", "No tenÃ©s permiso para operar esta automotora.");

        if (!requireActivePlan) return dealership;

        var account = string.Equals(dealership.RowKey, accountId, StringComparison.Ordinal)
            ? dealership
            : await _dealershipStorage.GetByIdAsync(accountId);
        if (account is null ||
            !string.Equals(account.RowKey, accountId, StringComparison.Ordinal) ||
            !string.Equals(DealershipStorageService.GetAccountId(account), accountId, StringComparison.Ordinal))
            throw new ApiException(403, "dealership_forbidden", "La cuenta propietaria no estÃ¡ disponible.");

        if (!HasActivePlan(account))
            throw new ApiException(403, "inactive_plan", "Se requiere un plan activo para esta operaciÃ³n.");

        if (!string.Equals(dealership.RowKey, accountId, StringComparison.Ordinal) &&
            string.Equals(account.Plan, "basic", StringComparison.Ordinal))
            throw new ApiException(403, "branch_plan_forbidden",
                "El plan Basic solo permite operar la automotora principal.");

        return dealership;
    }

    /// <summary>
    /// Platform administration is resolved again from server configuration and
    /// the current root account, rather than trusting a role snapshot embedded in
    /// a long-lived browser session. RequireUserAsync supplies CSRF on writes.
    /// </summary>
    public async Task<SessionUser> RequirePlatformAdminAsync(HttpRequest request)
    {
        var user = await RequireUserAsync(request);
        var account = await _dealershipStorage.GetByIdAsync(user.AccountId);
        if (account is null ||
            !string.Equals(account.RowKey, user.AccountId, StringComparison.Ordinal) ||
            !string.Equals(DealershipStorageService.GetAccountId(account), user.AccountId, StringComparison.Ordinal) ||
            !PlatformAdministratorPolicy.IsConfigured(_configuration, DealershipStorageService.GetLoginEmail(account)))
            throw new ApiException(403, "platform_admin_required", "Se requiere un administrador de plataforma.");
        return user with { IsPlatformAdmin = true };
    }

    public Task RequireTrustedWriteAsync(HttpRequest request) =>
        RequireTrustedWriteAsync(request, allowAnonymous: true);

    /// <summary>
    /// Used only by anonymous auth endpoints.  A valid session turns this into the
    /// normal CSRF requirement; without a session, a browser request needs the
    /// app-specific XMLHttpRequest header and a trusted Origin when one is sent.
    /// This avoids relying on CORS alone as a CSRF control.
    /// </summary>
    public async Task RequireTrustedWriteAsync(HttpRequest request, bool allowAnonymous)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (!IsUnsafeMethod(request.Method)) return;

        var session = await _sessionStorage.GetSessionAsync(request, request.HttpContext.RequestAborted);
        if (session is not null)
        {
            if (!_sessionStorage.IsValidCsrfToken(request, session)) throw CsrfFailed();
            return;
        }

        if (!allowAnonymous)
            throw new ApiException(401, "session_required", "IniciÃ¡ sesiÃ³n para continuar.");

        if (!HasRequestedWithHeader(request))
            throw new ApiException(403, "write_not_trusted", "La solicitud no proviene de la aplicaciÃ³n permitida.");
        if (!HasTrustedOrigin(request))
            throw new ApiException(403, "origin_not_allowed", "El origen de la solicitud no estÃ¡ permitido.");
    }

    private static bool HasActivePlan(DealershipEntity account) =>
        string.Equals(account.SubscriptionStatus, "authorized", StringComparison.OrdinalIgnoreCase) &&
        SubscriptionCatalog.IsSupportedPlan(account.Plan);

    private async Task EnsureCurrentCredentialVersionAsync(SessionEntity session)
    {
        var account = await _dealershipStorage.GetByIdAsync(session.AccountId);
        if (account is null ||
            !string.Equals(account.RowKey, session.AccountId, StringComparison.Ordinal) ||
            !string.Equals(DealershipStorageService.GetAccountId(account), session.AccountId, StringComparison.Ordinal) ||
            account.CredentialVersion != session.CredentialVersion)
            throw new ApiException(401, "session_required", "Iniciá sesión para continuar.");
    }

    private static bool IsUnsafeMethod(string? method) =>
        !HttpMethods.IsGet(method ?? string.Empty) &&
        !HttpMethods.IsHead(method ?? string.Empty) &&
        !HttpMethods.IsOptions(method ?? string.Empty);

    private static ApiException CsrfFailed() =>
        new(403, "csrf_invalid", "La validaciÃ³n de la solicitud fallÃ³. ActualizÃ¡ la pÃ¡gina e intentÃ¡ nuevamente.");

    private static bool HasRequestedWithHeader(HttpRequest request) =>
        request.Headers.TryGetValue("X-Requested-With", out StringValues values) &&
        values.Count == 1 &&
        string.Equals(values[0], "RedAutos", StringComparison.Ordinal);

    private bool HasTrustedOrigin(HttpRequest request)
    {
        if (request.Headers.TryGetValue("Origin", out StringValues origins))
        {
            if (origins.Count != 1 || !TrustedOriginPolicy.TryNormalizeOrigin(
                    origins[0], _trustedOrigins.Contains("http://localhost:3000"), out var origin))
                return false;
            return _trustedOrigins.Contains(origin);
        }

        // Non-browser/API clients do not necessarily send Origin.  A browser that
        // identifies this as cross-site, however, must not bypass the origin check.
        var fetchSite = request.Headers["Sec-Fetch-Site"].ToString();
        return !string.Equals(fetchSite, "cross-site", StringComparison.OrdinalIgnoreCase);
    }

}
