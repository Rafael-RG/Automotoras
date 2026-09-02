namespace AutomotorasApi.Services;

/// <summary>
/// Validación simple por clave fija para los endpoints de administración de banners publicitarios.
/// No es un sistema de JWT/roles — solo compara el header "X-Admin-Key" contra la variable de
/// entorno/configuración "AdsAdminKey". Suficiente porque hay un único administrador (el dueño
/// de la plataforma) y el resto del backend tampoco tiene autenticación por token.
/// </summary>
public static class AdminAuthHelper
{
    public static bool IsValidAdminKey(Microsoft.AspNetCore.Http.HttpRequest req)
    {
        var expected = Environment.GetEnvironmentVariable("AdsAdminKey");
        if (string.IsNullOrEmpty(expected)) return false;

        if (!req.Headers.TryGetValue("X-Admin-Key", out var provided)) return false;

        return provided.ToString() == expected;
    }
}
