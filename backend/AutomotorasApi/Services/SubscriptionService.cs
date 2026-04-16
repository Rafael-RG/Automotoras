using System.Linq;
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
        ["basic"] = ("Plan Básico RedAutos – 1 sucursal", 2590m),
        ["pro"]   = ("Plan Pro RedAutos – Hasta 10 sucursales", 3990m),
    };

    public SubscriptionService(IConfiguration config)
    {
        _accessToken = config["MercadoPago:AccessToken"] ?? string.Empty;
        _http = new HttpClient { BaseAddress = new Uri("https://api.mercadopago.com") };
        _http.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", _accessToken);
    }

    /// <summary>
    /// Creates a MercadoPago preapproval (subscription) and returns the checkout URL and preapproval ID.
    /// </summary>
    public async Task<(string Url, string PreapprovalId)> CreateCheckoutAsync(
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

        var preapprovalId = root.TryGetProperty("id", out var idProp) ? idProp.GetString() ?? "" : "";

        // Use sandbox_init_point in dev, init_point in prod
        string checkoutUrl;
        if (root.TryGetProperty("sandbox_init_point", out var sandbox) && !string.IsNullOrEmpty(sandbox.GetString()))
            checkoutUrl = sandbox.GetString()!;
        else
            checkoutUrl = root.GetProperty("init_point").GetString()
                ?? throw new InvalidOperationException("MercadoPago no devolvió una URL de pago.");

        return (checkoutUrl, preapprovalId);
    }

    /// <summary>
    /// Searches for a preapproval by external_reference (dealershipId|plan).
    /// Useful when the preapproval ID was not stored at checkout creation.
    /// </summary>
    public async Task<(string DealershipId, string Plan, string Status, string SubscriptionId)?> SearchByExternalReferenceAsync(string dealershipId, string plan)
    {
        var extRef = Uri.EscapeDataString($"{dealershipId}|{plan}");
        var response = await _http.GetAsync($"/preapproval/search?external_reference={extRef}");
        if (!response.IsSuccessStatusCode) return null;

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = doc.RootElement;

        if (!root.TryGetProperty("results", out var results)) return null;
        if (results.GetArrayLength() == 0) return null;

        // Get the most recent preapproval
        var latest = results.EnumerateArray()
            .OrderByDescending(r => r.TryGetProperty("date_created", out var d) ? d.GetString() : "")
            .FirstOrDefault();

        var status = latest.TryGetProperty("status", out var st) ? st.GetString() ?? "" : "";
        var id = latest.TryGetProperty("id", out var idProp) ? idProp.GetString() ?? "" : "";

        return (dealershipId, plan, status, id);
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

    /// <summary>
    /// Returns next payment date and recent payment history for a preapproval.
    /// </summary>
    public async Task<(string NextPaymentDate, AutomotorasApi.Models.SubscriptionPaymentRecord[] Payments)> GetSubscriptionInfoAsync(string preapprovalId)
    {
        // Get preapproval details for next_payment_date
        var detailResp = await _http.GetAsync($"/preapproval/{preapprovalId}");
        var nextDate = "";
        if (detailResp.IsSuccessStatusCode)
        {
            using var doc = JsonDocument.Parse(await detailResp.Content.ReadAsStringAsync());
            var root = doc.RootElement;
            if (root.TryGetProperty("next_payment_date", out var nd))
            {
                var raw = nd.GetString() ?? "";
                nextDate = raw.Length >= 10 ? raw[..10] : raw;
            }
        }

        // Get authorized payments (payment history)
        var paymentsResp = await _http.GetAsync($"/authorized_payments/search?preapproval_id={preapprovalId}&limit=10");
        var payments = new List<AutomotorasApi.Models.SubscriptionPaymentRecord>();
        if (paymentsResp.IsSuccessStatusCode)
        {
            using var doc = JsonDocument.Parse(await paymentsResp.Content.ReadAsStringAsync());
            var root = doc.RootElement;
            if (root.TryGetProperty("results", out var results))
            {
                foreach (var item in results.EnumerateArray())
                {
                    var date = item.TryGetProperty("date_approved", out var d) ? d.GetString() ?? "" : "";
                    var amount = item.TryGetProperty("transaction_amount", out var a) ? a.GetDecimal() : 0m;
                    var currency = item.TryGetProperty("currency_id", out var c) ? c.GetString() ?? "UYU" : "UYU";
                    var status = item.TryGetProperty("status", out var s) ? s.GetString() ?? "" : "";
                    if (!string.IsNullOrEmpty(date))
                        payments.Add(new(date[..Math.Min(10, date.Length)], amount, currency, status));
                }
            }
        }

        return (nextDate, payments.ToArray());
    }
}
