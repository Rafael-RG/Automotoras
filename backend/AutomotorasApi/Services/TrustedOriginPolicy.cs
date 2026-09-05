using Microsoft.Extensions.Configuration;

namespace AutomotorasApi.Services;

/// <summary>
/// Centralizes the small, explicit set of browser origins trusted by CORS and
/// anonymous-auth CSRF checks. Production never inherits development or former
/// hosting origins implicitly.
/// </summary>
public static class TrustedOriginPolicy
{
    public const string DefaultProductionOrigin = "https://redautos.com.uy";

    private static readonly string[] DevelopmentOrigins =
    {
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    };

    public static string[] ReadAllowedOrigins(IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        var isDevelopment = IsDevelopment(configuration);
        var origins = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        // An absent setting uses RedAutos' canonical production origin. A present
        // but invalid setting is ignored (fail closed) instead of silently
        // widening trust to an arbitrary value.
        var frontendOrigin = configuration["FrontendUrl"];
        AddOrigin(origins,
            string.IsNullOrWhiteSpace(frontendOrigin) ? DefaultProductionOrigin : frontendOrigin,
            isDevelopment);

        AddDelimitedOrigins(origins, configuration["Cors:AllowedOrigins"], isDevelopment);
        AddDelimitedOrigins(origins, configuration["Session:TrustedOrigins"], isDevelopment);

        if (isDevelopment)
        {
            foreach (var origin in DevelopmentOrigins) AddOrigin(origins, origin, allowDevelopmentLoopback: true);
        }

        return origins.ToArray();
    }

    public static bool IsDevelopment(IConfiguration configuration) =>
        string.Equals(configuration["AZURE_FUNCTIONS_ENVIRONMENT"], "Development", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(configuration["DOTNET_ENVIRONMENT"], "Development", StringComparison.OrdinalIgnoreCase);

    public static bool TryNormalizeOrigin(
        string? value,
        bool allowDevelopmentLoopback,
        out string origin)
    {
        origin = string.Empty;
        if (string.IsNullOrWhiteSpace(value) || value.Length > 2048 ||
            value.Any(char.IsControl) ||
            !Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
            !string.IsNullOrEmpty(uri.UserInfo) ||
            !string.IsNullOrEmpty(uri.Query) ||
            !string.IsNullOrEmpty(uri.Fragment) ||
            (uri.AbsolutePath != "/" && uri.AbsolutePath.Length != 0) ||
            string.IsNullOrWhiteSpace(uri.Host))
            return false;

        var isHttps = uri.Scheme == Uri.UriSchemeHttps;
        var isDevelopmentHttpLoopback = allowDevelopmentLoopback &&
            uri.Scheme == Uri.UriSchemeHttp && uri.IsLoopback;
        if (!isHttps && !isDevelopmentHttpLoopback) return false;

        origin = uri.GetLeftPart(UriPartial.Authority);
        return true;
    }

    private static void AddDelimitedOrigins(HashSet<string> origins, string? configured, bool isDevelopment)
    {
        if (string.IsNullOrWhiteSpace(configured)) return;
        foreach (var origin in configured.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            AddOrigin(origins, origin, isDevelopment);
    }

    private static void AddOrigin(HashSet<string> origins, string? candidate, bool allowDevelopmentLoopback)
    {
        if (TryNormalizeOrigin(candidate, allowDevelopmentLoopback, out var origin)) origins.Add(origin);
    }
}
