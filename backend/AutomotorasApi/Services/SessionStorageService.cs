using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using AutomotorasApi.Models;
using Azure;
using Azure.Data.Tables;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Primitives;

namespace AutomotorasApi.Services;

/// <summary>
/// Persists opaque browser sessions in Azure Table Storage.
///
/// The session cookie itself is a high-entropy random value and is never stored.
/// A SHA-256 hash is used as the table RowKey, so looking up a session is a single
/// partition/row lookup rather than a table scan.  CSRF is derived from the raw
/// cookie with HMAC, which lets <c>/auth/me</c> recover it without persisting a
/// second bearer value.
/// </summary>
public sealed class SessionStorageService
{
    private const string TableName = "Sessions";
    private const string DefaultCookieName = "redautos_session";
    private const string DefaultCookiePath = "/";
    private const int EntropyBytes = 32;
    private const int MaximumLifetimeMinutes = 60 * 24 * 30;
    private static readonly byte[] CsrfPurpose = "redautos.csrf.v1"u8.ToArray();
    private static readonly object SessionCacheKey = new();

    private readonly TableClient _tableClient;
    private readonly IConfiguration _configuration;
    private readonly string _cookieName;
    private readonly string _cookiePath;
    private readonly string? _cookieDomain;
    private readonly TimeSpan _lifetime;
    private readonly bool? _secureCookies;
    private readonly SameSiteMode _sameSite;

    public SessionStorageService(TableServiceClient tableServiceClient, IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(tableServiceClient);
        _configuration = configuration ?? throw new ArgumentNullException(nameof(configuration));
        _tableClient = tableServiceClient.GetTableClient(TableName);
        _tableClient.CreateIfNotExists();

        _cookieName = ReadCookieName(configuration["Session:CookieName"]);
        _cookiePath = ReadCookiePath(configuration["Session:CookiePath"]);
        _cookieDomain = ReadCookieDomain(configuration["Session:CookieDomain"]);
        _lifetime = ReadLifetime(configuration);
        _secureCookies = ReadOptionalBoolean(configuration["Session:SecureCookies"]);
        _sameSite = ReadSameSite(configuration["Session:SameSite"]);
    }

    /// <summary>The configured cookie name, useful to the auth endpoints only.</summary>
    public string CookieName => _cookieName;

    public TimeSpan Lifetime => _lifetime;

    /// <summary>
    /// Creates a new opaque session.  The caller must pass CookieValue only to
    /// <see cref="AppendSessionCookie"/>; do not serialize it or place it in a log.
    /// </summary>
    public async Task<SessionCreationResult> CreateAsync(
        string accountId,
        bool isPlatformAdmin,
        HttpRequest request,
        long credentialVersion = 0,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(accountId);
        ArgumentNullException.ThrowIfNull(request);
        if (credentialVersion < 0) throw new ArgumentOutOfRangeException(nameof(credentialVersion));

        var token = CreateOpaqueValue();
        var tokenHash = HashOpaqueValue(token);
        var csrfToken = CreateCsrfToken(token);
        var now = DateTimeOffset.UtcNow;
        var session = new SessionEntity
        {
            PartitionKey = SessionEntity.SessionsPartitionKey,
            RowKey = tokenHash,
            TokenHash = tokenHash,
            CsrfTokenHash = HashOpaqueValue(csrfToken),
            AccountId = accountId,
            IsPlatformAdmin = isPlatformAdmin,
            CredentialVersion = credentialVersion,
            CreatedAt = now,
            ExpiresAt = now.Add(_lifetime),
        };

        // A SHA-256 collision is practically impossible, but retrying on a unique
        // insert collision avoids accidentally turning it into a user-visible 409.
        for (var attempt = 0; attempt < 3; attempt++)
        {
            try
            {
                await _tableClient.AddEntityAsync(session, EffectiveCancellationToken(request, cancellationToken));
                return new SessionCreationResult(session, token, csrfToken);
            }
            catch (RequestFailedException ex) when (ex.Status == 409 && attempt < 2)
            {
                token = CreateOpaqueValue();
                tokenHash = HashOpaqueValue(token);
                csrfToken = CreateCsrfToken(token);
                session.RowKey = tokenHash;
                session.TokenHash = tokenHash;
                session.CsrfTokenHash = HashOpaqueValue(csrfToken);
            }
        }

        // The loop either returned or threw.  This only exists to satisfy definite
        // assignment analysis if a storage implementation behaves unexpectedly.
        throw new InvalidOperationException("No se pudo crear la sesiÃ³n.");
    }

    /// <summary>
    /// Looks up and validates the current cookie.  Missing, malformed, expired,
    /// revoked, or corrupted records are deliberately indistinguishable to callers.
    /// Storage failures still propagate so they are not mistaken for a logout.
    /// </summary>
    public async Task<SessionEntity?> GetSessionAsync(
        HttpRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (!TryGetSessionCookie(request, out var token)) return null;

        if (request.HttpContext.Items.TryGetValue(SessionCacheKey, out var cachedValue) &&
            cachedValue is CachedSession cached &&
            string.Equals(cached.CookieValue, token, StringComparison.Ordinal))
            return cached.Session;

        var session = await GetSessionForTokenAsync(token, request, cancellationToken);
        if (session is not null && !session.IsActiveAt(DateTimeOffset.UtcNow)) session = null;

        request.HttpContext.Items[SessionCacheKey] = new CachedSession(token, session);
        return session;
    }

    /// <summary>
    /// Returns a validated session and the CSRF token for the same request.  This
    /// is the intended helper for <c>GET /auth/me</c>.
    /// </summary>
    public async Task<SessionContext?> GetAuthenticatedSessionAsync(
        HttpRequest request,
        CancellationToken cancellationToken = default)
    {
        var session = await GetSessionAsync(request, cancellationToken);
        if (session is null || !TryGetSessionCookie(request, out var token)) return null;
        return new SessionContext(session, CreateCsrfToken(token));
    }

    public async Task<SessionUser?> GetUserAsync(
        HttpRequest request,
        CancellationToken cancellationToken = default) =>
        (await GetSessionAsync(request, cancellationToken))?.ToUser();

    /// <summary>
    /// Revokes the session carried by this request.  It is intentionally
    /// idempotent: an already-revoked cookie is considered successfully logged out.
    /// </summary>
    public async Task<bool> RevokeCurrentAsync(
        HttpRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (!TryGetSessionCookie(request, out var token)) return false;

        var tokenHash = HashOpaqueValue(token);
        var revoked = await RevokeByHashAsync(tokenHash, request, cancellationToken);
        request.HttpContext.Items.Remove(SessionCacheKey);
        return revoked;
    }

    /// <summary>
    /// Invalidates all currently discoverable sessions for an account.  Use this
    /// after a password reset, credential compromise, or account disabling.
    /// </summary>
    public async Task<int> RevokeAccountSessionsAsync(
        string accountId,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(accountId);
        var revoked = 0;
        await foreach (var session in _tableClient.QueryAsync<SessionEntity>(
            entity => entity.PartitionKey == SessionEntity.SessionsPartitionKey && entity.AccountId == accountId,
            cancellationToken: cancellationToken))
        {
            if (session.RevokedAt is not null) continue;
            if (await RevokeByHashAsync(session.RowKey, request: null, cancellationToken)) revoked++;
        }
        return revoked;
    }

    /// <summary>
    /// Verifies the anti-CSRF header for a session previously loaded from this
    /// request.  Both the cookie and header are required; the raw opaque cookie is
    /// never exposed to JavaScript.
    /// </summary>
    public bool IsValidCsrfToken(HttpRequest request, SessionEntity session)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentNullException.ThrowIfNull(session);

        if (!TryGetSessionCookie(request, out var cookieValue) ||
            !request.Headers.TryGetValue("X-CSRF-Token", out StringValues values) ||
            values.Count != 1)
            return false;

        var supplied = values[0];
        if (string.IsNullOrWhiteSpace(supplied) || !IsOpaqueValue(supplied)) return false;

        var expected = CreateCsrfToken(cookieValue);
        return FixedTimeEquals(supplied, expected) &&
            FixedTimeEquals(HashOpaqueValue(expected), session.CsrfTokenHash);
    }

    /// <summary>Gets the derived CSRF value without exposing the session cookie.</summary>
    public string? GetCsrfToken(HttpRequest request) =>
        TryGetSessionCookie(request, out var token) ? CreateCsrfToken(token) : null;

    public SessionResponse BuildSessionResponse(SessionCreationResult creation)
    {
        ArgumentNullException.ThrowIfNull(creation);
        return new SessionResponse(
            creation.Session.AccountId,
            creation.Session.IsPlatformAdmin,
            creation.CsrfToken,
            creation.Session.ExpiresAt);
    }

    public SessionResponse BuildSessionResponse(SessionContext context)
    {
        ArgumentNullException.ThrowIfNull(context);
        return context.ToResponse();
    }

    /// <summary>
    /// Appends the session cookie with HttpOnly and a conservative SameSite policy.
    /// Set <c>Session:SameSite=None</c> explicitly only for a cross-site deployment;
    /// it is rejected unless the cookie is Secure.
    /// </summary>
    public void AppendSessionCookie(HttpResponse response, HttpRequest request, SessionCreationResult creation)
    {
        ArgumentNullException.ThrowIfNull(creation);
        AppendSessionCookie(response, request, creation.CookieValue, creation.Session.ExpiresAt);
    }

    public void AppendSessionCookie(
        HttpResponse response,
        HttpRequest request,
        string cookieValue,
        DateTimeOffset expiresAt)
    {
        ArgumentNullException.ThrowIfNull(response);
        ArgumentNullException.ThrowIfNull(request);
        if (!IsOpaqueValue(cookieValue)) throw new ArgumentException("Valor de sesiÃ³n invÃ¡lido.", nameof(cookieValue));

        response.Headers["Cache-Control"] = "no-store";
        response.Cookies.Append(_cookieName, cookieValue, CreateCookieOptions(request, expiresAt));
    }

    /// <summary>Clears the same scoped cookie that <see cref="AppendSessionCookie"/> sets.</summary>
    public void ExpireSessionCookie(HttpResponse response, HttpRequest request)
    {
        ArgumentNullException.ThrowIfNull(response);
        ArgumentNullException.ThrowIfNull(request);

        var options = CreateCookieOptions(request, DateTimeOffset.UnixEpoch);
        options.Expires = DateTimeOffset.UnixEpoch;
        options.MaxAge = TimeSpan.Zero;
        response.Headers["Cache-Control"] = "no-store";
        response.Cookies.Append(_cookieName, string.Empty, options);
    }

    /// <summary>True only for a well-formed version-one opaque session cookie.</summary>
    public bool TryGetSessionCookie(HttpRequest request, out string cookieValue)
    {
        ArgumentNullException.ThrowIfNull(request);
        cookieValue = string.Empty;
        var candidate = request.Cookies[_cookieName];
        if (!IsOpaqueValue(candidate)) return false;
        cookieValue = candidate!;
        return true;
    }

    /// <summary>SHA-256 encoded as uppercase hexadecimal for a Table Storage RowKey.</summary>
    public static string HashOpaqueValue(string value)
    {
        ArgumentNullException.ThrowIfNull(value);
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    }

    private async Task<SessionEntity?> GetSessionForTokenAsync(
        string token,
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        var tokenHash = HashOpaqueValue(token);
        try
        {
            var response = await _tableClient.GetEntityAsync<SessionEntity>(
                SessionEntity.SessionsPartitionKey,
                tokenHash,
                cancellationToken: EffectiveCancellationToken(request, cancellationToken));
            var session = response.Value;

            // Do not trust a row merely because it was addressed by its RowKey:
            // reject malformed/corrupted entities and compare hashes in fixed time.
            return session.PartitionKey == SessionEntity.SessionsPartitionKey &&
                FixedTimeEquals(session.RowKey, tokenHash) &&
                FixedTimeEquals(session.TokenHash, tokenHash) &&
                !string.IsNullOrWhiteSpace(session.CsrfTokenHash) &&
                !string.IsNullOrWhiteSpace(session.AccountId)
                ? session
                : null;
        }
        catch (RequestFailedException ex) when (ex.Status == 404)
        {
            return null;
        }
    }

    private async Task<bool> RevokeByHashAsync(
        string tokenHash,
        HttpRequest? request,
        CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < TableRetry.MaxAttempts; attempt++)
        {
            SessionEntity? session;
            try
            {
                var response = await _tableClient.GetEntityAsync<SessionEntity>(
                    SessionEntity.SessionsPartitionKey,
                    tokenHash,
                    cancellationToken: EffectiveCancellationToken(request, cancellationToken));
                session = response.Value;
            }
            catch (RequestFailedException ex) when (ex.Status == 404)
            {
                return false;
            }

            if (!FixedTimeEquals(session.RowKey, tokenHash) || !FixedTimeEquals(session.TokenHash, tokenHash))
                return false;
            if (session.RevokedAt is not null) return true;

            session.RevokedAt = DateTimeOffset.UtcNow;
            try
            {
                await _tableClient.UpdateEntityAsync(
                    session,
                    session.ETag,
                    TableUpdateMode.Replace,
                    EffectiveCancellationToken(request, cancellationToken));
                return true;
            }
            catch (RequestFailedException ex) when (ex.Status == 412 && attempt + 1 < TableRetry.MaxAttempts)
            {
                // Re-read the entity and either observe the other revocation or try
                // again with its fresh ETag.
            }
        }

        // A concurrent logout/revocation is safe to treat as completed; the caller
        // always expires its cookie and does not need a conflict response.
        return true;
    }

    private CookieOptions CreateCookieOptions(HttpRequest request, DateTimeOffset expiresAt)
    {
        var secure = ShouldUseSecureCookies(request);
        if (_sameSite == SameSiteMode.None && !secure)
            throw new InvalidOperationException("Session:SameSite=None requiere Session:SecureCookies=true o HTTPS.");

        var options = new CookieOptions
        {
            HttpOnly = true,
            IsEssential = true,
            Secure = secure,
            SameSite = _sameSite,
            Path = _cookiePath,
            Expires = expiresAt,
            MaxAge = expiresAt <= DateTimeOffset.UtcNow ? TimeSpan.Zero : expiresAt - DateTimeOffset.UtcNow,
        };
        if (_cookieDomain is not null) options.Domain = _cookieDomain;
        return options;
    }

    private bool ShouldUseSecureCookies(HttpRequest request)
    {
        if (_secureCookies is not null) return _secureCookies.Value;
        if (request.IsHttps || string.Equals(request.Headers["X-Forwarded-Proto"], "https", StringComparison.OrdinalIgnoreCase))
            return true;

        var environment = _configuration["AZURE_FUNCTIONS_ENVIRONMENT"] ?? _configuration["DOTNET_ENVIRONMENT"];
        return string.Equals(environment, "Production", StringComparison.OrdinalIgnoreCase);
    }

    private static string CreateOpaqueValue() =>
        "v1." + Convert.ToBase64String(RandomNumberGenerator.GetBytes(EntropyBytes))
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');

    private static string CreateCsrfToken(string opaqueCookie)
    {
        if (!IsOpaqueValue(opaqueCookie)) throw new ArgumentException("Cookie de sesiÃ³n invÃ¡lida.", nameof(opaqueCookie));
        var hash = HMACSHA256.HashData(Encoding.UTF8.GetBytes(opaqueCookie), CsrfPurpose);
        return "v1." + Convert.ToBase64String(hash)
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');
    }

    private static bool IsOpaqueValue(string? value)
    {
        if (value is null || value.Length != 46 || !value.StartsWith("v1.", StringComparison.Ordinal)) return false;
        foreach (var character in value.AsSpan(3))
        {
            if (!(character is >= 'A' and <= 'Z' or >= 'a' and <= 'z' or >= '0' and <= '9' or '-' or '_'))
                return false;
        }
        return true;
    }

    private static bool FixedTimeEquals(string left, string right)
    {
        if (left.Length != right.Length) return false;
        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(left),
            Encoding.UTF8.GetBytes(right));
    }

    private static CancellationToken EffectiveCancellationToken(HttpRequest? request, CancellationToken supplied) =>
        supplied.CanBeCanceled ? supplied : request?.HttpContext.RequestAborted ?? CancellationToken.None;

    private static TimeSpan ReadLifetime(IConfiguration configuration)
    {
        var raw = configuration["Session:Lifetime"];
        if (TimeSpan.TryParse(raw, CultureInfo.InvariantCulture, out var parsed) && IsValidLifetime(parsed)) return parsed;

        if (int.TryParse(configuration["Session:LifetimeMinutes"], NumberStyles.None, CultureInfo.InvariantCulture, out var minutes) &&
            IsValidLifetime(TimeSpan.FromMinutes(minutes)))
            return TimeSpan.FromMinutes(minutes);

        if (int.TryParse(configuration["Session:LifetimeHours"], NumberStyles.None, CultureInfo.InvariantCulture, out var hours) &&
            IsValidLifetime(TimeSpan.FromHours(hours)))
            return TimeSpan.FromHours(hours);

        return TimeSpan.FromHours(12);
    }

    private static bool IsValidLifetime(TimeSpan value) =>
        value >= TimeSpan.FromMinutes(5) && value <= TimeSpan.FromMinutes(MaximumLifetimeMinutes);

    private static bool? ReadOptionalBoolean(string? value) =>
        bool.TryParse(value, out var parsed) ? parsed : null;

    private static SameSiteMode ReadSameSite(string? value) =>
        value?.Trim().ToLowerInvariant() switch
        {
            "none" => SameSiteMode.None,
            "lax" => SameSiteMode.Lax,
            "strict" or null or "" => SameSiteMode.Strict,
            _ => SameSiteMode.Strict,
        };

    private static string ReadCookieName(string? configured)
    {
        if (string.IsNullOrWhiteSpace(configured) || configured.Length > 100) return DefaultCookieName;
        const string allowedPunctuation = "!#$%&'*+-.^_`|~";
        return configured.All(character => char.IsLetterOrDigit(character) || allowedPunctuation.Contains(character))
            ? configured
            : DefaultCookieName;
    }

    private static string ReadCookiePath(string? configured) =>
        !string.IsNullOrWhiteSpace(configured) && configured.StartsWith("/", StringComparison.Ordinal) &&
        !configured.Contains(';') && !configured.Contains('\r') && !configured.Contains('\n')
            ? configured
            : DefaultCookiePath;

    private static string? ReadCookieDomain(string? configured)
    {
        if (string.IsNullOrWhiteSpace(configured)) return null;
        var value = configured.Trim();
        var host = value.TrimStart('.');
        return Uri.CheckHostName(host) is UriHostNameType.Dns or UriHostNameType.IPv4 or UriHostNameType.IPv6
            ? value
            : null;
    }

    private sealed record CachedSession(string CookieValue, SessionEntity? Session);
}
