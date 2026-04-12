using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Configuration;

namespace AutomotorasApi.Services;

public class SubscriptionService
{
    private readonly HttpClient _http;
    private readonly string _accessToken;

    private static readonly Dictionary<string, (string Reason, decimal Amount)> Plans = new()
    {
        ["test"]  = ("Plan Test RedAutos – prueba", 15m),
        ["basic"] = ("Plan Básico RedAutos – 1 sucursal", 590m),
        ["pro"]   = ("Plan Pro RedAutos – Múltiples sucursales", 1490m),
    };

    public SubscriptionService(IConfiguration config)
    {
        _accessToken = config["MercadoPago:AccessToken"] ?? string.Empty;
        _http = new HttpClient { BaseAddress = new Uri("https://api.mercadopago.com") };
        _http.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", _accessToken);
    }

    /// <summary>
    /// Creates a MercadoPago preapproval (subscription) and returns the checkout URL.
    /// </summary>
    public async Task<string> CreateCheckoutAsync(
        string dealershipId, string plan, string payerEmail, string backUrl)
    {
        if (!Plans.TryGetValue(plan, out var info))
            throw new ArgumentException($"Plan desconocido: {plan}");

        var body = new
        {
            reason = info.Reason,
            auto_recurring = new
            {
                frequency = 1,
                frequency_type = "months",
                transaction_amount = info.Amount,
                currency_id = "UYU",
            },
            payer_email = payerEmail,
            back_url = backUrl,
            external_reference = $"{dealershipId}|{plan}",
            status = "pending",
        };

        var response = await _http.PostAsJsonAsync("/preapproval", body);
        if (!response.IsSuccessStatusCode)
        {
            var errBody = await response.Content.ReadAsStringAsync();
            throw new InvalidOperationException($"MercadoPago error {(int)response.StatusCode}: {errBody}");
        }

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = doc.RootElement;

        // Use sandbox_init_point in dev, init_point in prod
        if (root.TryGetProperty("sandbox_init_point", out var sandbox) && !string.IsNullOrEmpty(sandbox.GetString()))
            return sandbox.GetString()!;

        return root.GetProperty("init_point").GetString()
            ?? throw new InvalidOperationException("MercadoPago no devolvió una URL de pago.");
    }

    /// <summary>
    /// Fetches preapproval status from MP and returns (dealershipId, plan, status, subscriptionId).
    /// </summary>
    public async Task<(string DealershipId, string Plan, string Status, string SubscriptionId)?> GetPreapprovalStatusAsync(string preapprovalId)
    {
        var response = await _http.GetAsync($"/preapproval/{preapprovalId}");
        if (!response.IsSuccessStatusCode) return null;

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = doc.RootElement;

        var extRef = root.TryGetProperty("external_reference", out var er) ? er.GetString() ?? "" : "";
        var status = root.TryGetProperty("status", out var st) ? st.GetString() ?? "" : "";
        var id = root.TryGetProperty("id", out var idProp) ? idProp.GetString() ?? "" : "";

        var parts = extRef.Split('|');
        if (parts.Length != 2) return null;

        return (parts[0], parts[1], status, id);
    }
}
