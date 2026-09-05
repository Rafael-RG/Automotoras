namespace AutomotorasApi.Services;

/// <summary>
/// URLs persisted by untrusted users are limited to absolute HTTPS links. This
/// prevents stored javascript:, data:, and credential-bearing URLs from reaching
/// public anchors, including rows that predate the validation boundary.
/// </summary>
public static class UrlPolicy
{
    public const int MaximumUrlLength = 2048;

    public static string RequireHttpsUrl(string? value, string code, string message)
    {
        if (!TryNormalizeHttpsUrl(value, out var normalized))
            throw new ApiException(400, code, message);
        return normalized;
    }

    public static string NormalizeOptionalHttpsUrl(string? value, string code, string message) =>
        string.IsNullOrWhiteSpace(value) ? string.Empty : RequireHttpsUrl(value, code, message);

    public static string SafeHttpsUrlOrEmpty(string? value) =>
        TryNormalizeHttpsUrl(value, out var normalized) ? normalized : string.Empty;

    public static bool TryNormalizeHttpsUrl(string? value, out string normalized)
    {
        normalized = string.Empty;
        if (string.IsNullOrWhiteSpace(value) || value.Length > MaximumUrlLength || value.Any(char.IsControl))
            return false;

        if (!Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri) ||
            uri.Scheme != Uri.UriSchemeHttps ||
            string.IsNullOrWhiteSpace(uri.Host) ||
            !string.IsNullOrEmpty(uri.UserInfo))
            return false;

        normalized = uri.AbsoluteUri;
        return true;
    }
}
