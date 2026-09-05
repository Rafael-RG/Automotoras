using Azure;
using Azure.Data.Tables;

namespace AutomotorasApi.Models;

/// <summary>
/// Server-side session record.  The browser receives only a random opaque value;
/// this table stores its SHA-256 hash (as both RowKey and TokenHash), never the
/// cookie value itself.
/// </summary>
public sealed class SessionEntity : ITableEntity
{
    public const string SessionsPartitionKey = "session";

    public string PartitionKey { get; set; } = SessionsPartitionKey;

    /// <summary>SHA-256 hash of the opaque cookie value.</summary>
    public string RowKey { get; set; } = string.Empty;

    public DateTimeOffset? Timestamp { get; set; }

    public ETag ETag { get; set; }

    /// <summary>The root account that owns this session.</summary>
    public string AccountId { get; set; } = string.Empty;

    public bool IsPlatformAdmin { get; set; }

    /// <summary>Credential epoch captured when this session was issued.</summary>
    public long CredentialVersion { get; set; }

    /// <summary>Duplicated explicitly to make integrity checks self-describing.</summary>
    public string TokenHash { get; set; } = string.Empty;

    /// <summary>
    /// Hash of the deterministic CSRF value derived from the opaque cookie.  The
    /// raw CSRF token is not stored in Table Storage.
    /// </summary>
    public string CsrfTokenHash { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }

    public DateTimeOffset? RevokedAt { get; set; }

    public bool IsActiveAt(DateTimeOffset now) =>
        !string.IsNullOrWhiteSpace(AccountId) &&
        RevokedAt is null &&
        ExpiresAt > now;

    public SessionUser ToUser() => new(AccountId, IsPlatformAdmin, RowKey, ExpiresAt);
}
