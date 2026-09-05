using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace AutomotorasApi.Services;

public static class WebhookSignatureValidator
{
    public static readonly TimeSpan DefaultMaxAge = TimeSpan.FromMinutes(5);
    public static readonly TimeSpan MaximumMaxAge = TimeSpan.FromHours(24);
    private static readonly TimeSpan FutureClockSkew = TimeSpan.FromMinutes(1);

    public static bool TryParseSignature(string? header, out string ts, out string v1)
    {
        ts = string.Empty;
        v1 = string.Empty;
        if (string.IsNullOrWhiteSpace(header) || header.Length > 512) return false;

        foreach (var part in header.Split(','))
        {
            var pair = part.Split('=', 2, StringSplitOptions.TrimEntries);
            if (pair.Length != 2 || pair[1].Length == 0) return false;

            if (pair[0] == "ts" && ts.Length == 0) ts = pair[1];
            else if (pair[0] == "v1" && v1.Length == 0) v1 = pair[1];
            else return false; // Reject duplicate or ambiguous signature components.
        }

        return ts.Length > 0 && v1.Length == 64;
    }

    /// <summary>
    /// Validates the MP manifest and binds the resource actually processed to signed
    /// query data.id. Alphanumeric identifiers are lower-cased, as required by MP.
    /// Seconds and milliseconds are accepted without changing the signed ts text.
    /// Repeated signatures inside the window remain valid: conditional storage
    /// transitions provide idempotence. Retries reusing an older timestamp outside
    /// the window are rejected; verify retry signing before changing the bounded
    /// window, and use authenticated reconciliation for missed notifications.
    /// </summary>
    public static bool Validate(
        string? ts,
        string? v1,
        string? requestId,
        string? queryDataId,
        string? bodyResourceId,
        string? secret,
        DateTimeOffset now,
        TimeSpan? maxAge = null)
    {
        var ageLimit = maxAge ?? DefaultMaxAge;
        if (string.IsNullOrWhiteSpace(secret) || !IsManifestToken(requestId) ||
            ageLimit <= TimeSpan.Zero || ageLimit > MaximumMaxAge ||
            !TryNormalizeResourceId(queryDataId, out var signedId) ||
            !TryNormalizeResourceId(bodyResourceId, out var processedId) ||
            !string.Equals(signedId, processedId, StringComparison.Ordinal) ||
            ts is null || (ts.Length != 10 && ts.Length != 13) ||
            !long.TryParse(ts, NumberStyles.None, CultureInfo.InvariantCulture, out var timestamp) ||
            v1 is null || v1.Length != 64)
            return false;

        DateTimeOffset sentAt;
        try
        {
            sentAt = ts.Length == 13
                ? DateTimeOffset.FromUnixTimeMilliseconds(timestamp)
                : DateTimeOffset.FromUnixTimeSeconds(timestamp);
        }
        catch (ArgumentOutOfRangeException)
        {
            return false;
        }

        var age = now - sentAt;
        if (age > ageLimit || age < -FutureClockSkew) return false;

        byte[] suppliedHash;
        try
        {
            suppliedHash = Convert.FromHexString(v1);
        }
        catch (FormatException)
        {
            return false;
        }

        var manifest = $"id:{signedId};request-id:{requestId};ts:{ts};";
        var expectedHash = HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(manifest));
        return CryptographicOperations.FixedTimeEquals(expectedHash, suppliedHash);
    }

    public static bool TryNormalizeResourceId(string? value, out string normalized)
    {
        normalized = string.Empty;
        if (!IsManifestToken(value)) return false;
        normalized = value!.ToLowerInvariant();
        return true;
    }

    private static bool IsManifestToken(string? value) =>
        !string.IsNullOrWhiteSpace(value) && value.Length <= 200 &&
        value.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_');
}