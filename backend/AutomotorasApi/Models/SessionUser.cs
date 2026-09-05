namespace AutomotorasApi.Models;

/// <summary>
/// The authenticated identity made available to functions.  It intentionally
/// contains no credential, cookie, CSRF value, email, or mutable dealership data.
/// The first two constructor parameters stay small so functions and tests can use
/// <c>new SessionUser(accountId, isPlatformAdmin)</c>.
/// </summary>
public sealed record SessionUser(
    string AccountId,
    bool IsPlatformAdmin,
    string SessionId = "",
    DateTimeOffset? ExpiresAt = null);

/// <summary>Material returned after creating or restoring a browser session.</summary>
public sealed record SessionResponse(
    string AccountId,
    bool IsPlatformAdmin,
    string CsrfToken,
    DateTimeOffset ExpiresAt);

/// <summary>
/// A one-time creation result.  CookieValue must be sent only through an HttpOnly
/// Set-Cookie header; it must never be serialized into a JSON response or logged.
/// </summary>
public sealed record SessionCreationResult(
    SessionEntity Session,
    string CookieValue,
    string CsrfToken);

/// <summary>
/// A validated session plus the request-specific CSRF token derived from its
/// HttpOnly cookie.  It is suitable for <c>/auth/me</c>; it never exposes the
/// opaque cookie itself.
/// </summary>
public sealed record SessionContext(SessionEntity Session, string CsrfToken)
{
    public string AccountId => Session.AccountId;
    public bool IsPlatformAdmin => Session.IsPlatformAdmin;
    public DateTimeOffset ExpiresAt => Session.ExpiresAt;
    public string SessionId => Session.RowKey;

    public SessionResponse ToResponse() =>
        new(AccountId, IsPlatformAdmin, CsrfToken, ExpiresAt);
}
