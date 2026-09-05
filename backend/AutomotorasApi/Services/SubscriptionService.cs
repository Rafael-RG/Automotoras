using AutomotorasApi.Models;
using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Configuration;

namespace AutomotorasApi.Services;

public class SubscriptionService
{
    private static readonly Uri ProviderOrigin = new("https://api.mercadopago.com");
    private const string DefaultFrontendUrl = "https://redautos.com.uy";
    public static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(15);
    private const int MaximumResponseBytes = 256 * 1024;
    private readonly HttpClient _http;
    private readonly string _accessToken;
    private readonly IConfiguration _config;

    public SubscriptionService(IConfiguration config)
        : this(config, new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }))
    {
    }

    // MAIN may register a typed HttpClient with redirects disabled. The overload also
    // permits a synthetic HttpMessageHandler in tests, without provider credentials.
    public SubscriptionService(IConfiguration config, HttpClient http)
    {
        _config = config;
        _http = http;
        _accessToken = config["MercadoPago:AccessToken"] ?? string.Empty;
    }

    public static bool IsDevelopment(IConfiguration config) =>
        string.Equals(config["AZURE_FUNCTIONS_ENVIRONMENT"], "Development", StringComparison.Ordinal);

    public static string GetCheckoutBackUrl(IConfiguration config)
    {
        var configuredUrl = config["FrontendUrl"] ?? DefaultFrontendUrl;
        if (!Uri.TryCreate(configuredUrl, UriKind.Absolute, out var frontend) ||
            !string.IsNullOrEmpty(frontend.UserInfo) ||
            !string.IsNullOrEmpty(frontend.Query) || !string.IsNullOrEmpty(frontend.Fragment) ||
            frontend.AbsolutePath != "/" ||
            (frontend.Scheme != Uri.UriSchemeHttps &&
                !(IsDevelopment(config) && frontend.IsLoopback && frontend.Scheme == Uri.UriSchemeHttp)) ||
            (frontend.IsLoopback && !IsDevelopment(config)))
            throw new InvalidOperationException("FrontendUrl debe ser un origen HTTPS; localhost solo se permite en Development.");

        // Neither the caller's BackUrl nor the HTTP Host/Origin headers select this URL.
        return new Uri(frontend, "/admin?sub=ok").AbsoluteUri;
    }

    public Task<(string Url, string PreapprovalId)> CreateCheckoutAsync(
        string accountId, string plan, string payerEmail, CancellationToken cancellationToken = default) =>
        CreateCheckoutAsync(accountId, plan, payerEmail, checkoutAttemptId: string.Empty, cancellationToken);

    public async Task<(string Url, string PreapprovalId)> CreateCheckoutAsync(
        string accountId, string plan, string payerEmail, string checkoutAttemptId,
        CancellationToken cancellationToken = default)
    {
        if (!SubscriptionCatalog.TryGetPlan(plan, out var definition))
            throw new ArgumentException("El plan debe ser basic o plus.", nameof(plan));
        if (!WebhookSignatureValidator.TryNormalizeResourceId(accountId, out _))
            throw new ArgumentException("La cuenta de facturación no es válida.", nameof(accountId));
        if (!string.IsNullOrEmpty(checkoutAttemptId) &&
            !TryNormalizeCheckoutAttemptId(checkoutAttemptId, out _))
            throw new ArgumentException("El intento de checkout no es válido.", nameof(checkoutAttemptId));
        if (!System.Net.Mail.MailAddress.TryCreate(payerEmail, out var email) ||
            !string.Equals(email.Address, payerEmail, StringComparison.Ordinal))
            throw new ArgumentException("El correo de facturación no es válido.", nameof(payerEmail));

        var body = new
        {
            reason = definition.Reason,
            auto_recurring = new
            {
                frequency = SubscriptionCatalog.Frequency,
                frequency_type = SubscriptionCatalog.FrequencyType,
                transaction_amount = definition.Amount,
                currency_id = SubscriptionCatalog.Currency,
            },
            payer_email = payerEmail,
            back_url = GetCheckoutBackUrl(_config),
            external_reference = CreateExternalReference(accountId, plan, checkoutAttemptId),
            status = "pending",
        };

        using var doc = await SendAsync(HttpMethod.Post, "/preapproval", body, cancellationToken,
            providerMayHaveCreated: true);
        var root = doc.RootElement;
        if (!TryGetString(root, "id", out var returnedId) ||
            !WebhookSignatureValidator.TryNormalizeResourceId(returnedId, out var preapprovalId))
            throw new SubscriptionProviderException(false, providerMayHaveCreated: true);

        var useSandbox = IsDevelopment(_config) &&
            bool.TryParse(_config["MercadoPago:UseSandbox"], out var enabled) && enabled;
        var urlProperty = useSandbox ? "sandbox_init_point" : "init_point";
        if (!TryGetString(root, urlProperty, out var checkoutUrl) ||
            !Uri.TryCreate(checkoutUrl, UriKind.Absolute, out var checkout) ||
            checkout.Scheme != Uri.UriSchemeHttps || checkout.IsLoopback ||
            !string.IsNullOrEmpty(checkout.UserInfo))
            throw new SubscriptionProviderException(false, providerMayHaveCreated: true);

        return (checkoutUrl, preapprovalId);
    }

    public async Task<SubscriptionState> GetPreapprovalStatusAsync(
        string preapprovalId, CancellationToken cancellationToken = default)
    {
        if (!WebhookSignatureValidator.TryNormalizeResourceId(preapprovalId, out var requestedId))
            throw new SubscriptionProviderException(false);

        using var doc = await SendAsync(HttpMethod.Get,
            $"/preapproval/{Uri.EscapeDataString(requestedId)}", null, cancellationToken);
        if (!TryValidatePreapproval(doc.RootElement, requestedId, out var state))
            throw new SubscriptionProviderException(false);
        return state;
    }

    /// <summary>
    /// Resolves a reservation only by its server-generated nonce. Mercado Pago's
    /// documented free-text search is intentionally treated as discovery only.
    /// Its response schema is not used for financial validation; an exact
    /// reference can only nominate an ID, which is then fetched and validated
    /// through the canonical single-preapproval endpoint.
    /// </summary>
    public async Task<string?> FindPreapprovalIdForCheckoutAttemptAsync(
        string accountId, string plan, string checkoutAttemptId, CancellationToken cancellationToken = default)
    {
        if (!WebhookSignatureValidator.TryNormalizeResourceId(accountId, out _) ||
            !SubscriptionCatalog.IsSupportedPlan(plan) ||
            !TryNormalizeCheckoutAttemptId(checkoutAttemptId, out var normalizedAttempt))
            throw new SubscriptionProviderException(false);

        var expectedReference = CreateExternalReference(accountId, plan, normalizedAttempt);
        using var doc = await SendAsync(HttpMethod.Get,
            $"/preapproval/search?q={Uri.EscapeDataString(normalizedAttempt)}&limit=100", null, cancellationToken);
        var root = doc.RootElement;
        if (!TryGetProperty(root, "results", out var results) || results.ValueKind != JsonValueKind.Array ||
            !TryGetProperty(root, "paging", out var paging) || paging.ValueKind != JsonValueKind.Object ||
            !TryGetProperty(paging, "total", out var totalValue) || totalValue.ValueKind != JsonValueKind.Number ||
            !totalValue.TryGetInt32(out var total) || total < 0)
            throw new SubscriptionProviderException(false);

        // q is not documented as an exact external-reference filter. Never select
        // a first/latest result or paginate into an ambiguous set.
        if (total == 0) return null;
        if (total != 1 || results.GetArrayLength() != 1)
            throw new SubscriptionProviderException(false);

        var result = results[0];
        if (result.ValueKind != JsonValueKind.Object ||
            !TryGetString(result, "external_reference", out var externalReference) ||
            !string.Equals(externalReference, expectedReference, StringComparison.Ordinal) ||
            !TryGetString(result, "id", out var returnedId) ||
            !WebhookSignatureValidator.TryNormalizeResourceId(returnedId, out var preapprovalId))
            throw new SubscriptionProviderException(false);

        return preapprovalId;
    }

    public async Task CancelPreapprovalAsync(string preapprovalId, CancellationToken cancellationToken = default)
    {
        if (!WebhookSignatureValidator.TryNormalizeResourceId(preapprovalId, out var normalizedId))
            throw new SubscriptionProviderException(false);

        using var doc = await SendAsync(HttpMethod.Put,
            $"/preapproval/{Uri.EscapeDataString(normalizedId)}", new { status = "canceled" }, cancellationToken);
        if (!TryGetString(doc.RootElement, "id", out var returnedId) ||
            !WebhookSignatureValidator.TryNormalizeResourceId(returnedId, out var returnedNormalizedId) ||
            !SubscriptionState.SameId(returnedNormalizedId, normalizedId) ||
            !TryGetString(doc.RootElement, "status", out var status) ||
            SubscriptionState.NormalizeStatus(status) != "canceled")
            throw new SubscriptionProviderException(false);
    }

    /// <summary>
    /// Shared domain validation for webhook, verification and private billing reads.
    /// A valid catalog reference still must match the root's active/pending ID and
    /// plan before ApplySubscriptionAsync may persist any transition.
    /// </summary>
    public static bool TryValidatePreapproval(
        JsonElement root, string requestedId, [NotNullWhen(true)] out SubscriptionState? state)
    {
        state = null;
        if (!WebhookSignatureValidator.TryNormalizeResourceId(requestedId, out var expectedId) ||
            !TryGetString(root, "id", out var returnedId) ||
            !WebhookSignatureValidator.TryNormalizeResourceId(returnedId, out var id) ||
            !string.Equals(id, expectedId, StringComparison.Ordinal) ||
            !TryGetString(root, "external_reference", out var reference) ||
            !TryGetString(root, "status", out var status) ||
            SubscriptionState.NormalizeStatus(status) is not { } normalizedStatus ||
            !TryGetProperty(root, "version", out var version) ||
            version.ValueKind != JsonValueKind.Number || !version.TryGetInt64(out var providerVersion) ||
            providerVersion < 0)
            return false;

        var parts = reference.Split('|');
        if (parts.Length is not (2 or 3) ||
            !WebhookSignatureValidator.TryNormalizeResourceId(parts[0], out _) ||
            !SubscriptionCatalog.TryGetPlan(parts[1], out var plan) ||
            !TryGetProperty(root, "auto_recurring", out var recurring) ||
            !TryGetString(recurring, "currency_id", out var currency) || currency != SubscriptionCatalog.Currency ||
            !TryGetProperty(recurring, "transaction_amount", out var amount) ||
            amount.ValueKind != JsonValueKind.Number || !amount.TryGetDecimal(out var price) || price != plan.Amount ||
            !TryGetProperty(recurring, "frequency", out var frequency) ||
            frequency.ValueKind != JsonValueKind.Number || !frequency.TryGetInt32(out var period) || period != SubscriptionCatalog.Frequency ||
            !TryGetString(recurring, "frequency_type", out var frequencyType) || frequencyType != SubscriptionCatalog.FrequencyType)
            return false;

        var checkoutAttemptId = string.Empty;
        if (parts.Length == 3 && !TryNormalizeCheckoutAttemptId(parts[2], out checkoutAttemptId))
            return false;

        var nextDate = string.Empty;
        if (TryGetString(root, "next_payment_date", out var date) &&
            DateTimeOffset.TryParse(date, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDate))
        {
            nextDate = parsedDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        }

        state = new SubscriptionState(parts[0], parts[1], id, normalizedStatus, nextDate, checkoutAttemptId,
            providerVersion);
        return true;
    }

    public async Task<(string NextPaymentDate, SubscriptionPaymentRecord[] Payments)> GetSubscriptionInfoAsync(
        SubscriptionState subscription, CancellationToken cancellationToken = default)
    {
        using var doc = await SendAsync(HttpMethod.Get,
            $"/authorized_payments/search?preapproval_id={Uri.EscapeDataString(subscription.SubscriptionId)}&limit=10",
            null, cancellationToken);
        if (!TryGetProperty(doc.RootElement, "results", out var results) || results.ValueKind != JsonValueKind.Array)
            throw new SubscriptionProviderException(false);

        var payments = new List<SubscriptionPaymentRecord>();
        foreach (var item in results.EnumerateArray().Take(10))
        {
            // Do not display unbound records or invent amounts/currencies on missing data.
            // Authorized-payment status is display-only, never a subscription transition.
            if (!TryGetString(item, "preapproval_id", out var id) || !SubscriptionState.SameId(id, subscription.SubscriptionId))
                throw new SubscriptionProviderException(false);
            if (!TryGetString(item, "date_approved", out var date)) continue;
            if (!DateTimeOffset.TryParse(date, CultureInfo.InvariantCulture, DateTimeStyles.None, out var approvedAt) ||
                !TryGetProperty(item, "transaction_amount", out var amount) || amount.ValueKind != JsonValueKind.Number ||
                !amount.TryGetDecimal(out var price) || price < 0m ||
                !TryGetString(item, "currency_id", out var currency) || currency != SubscriptionCatalog.Currency ||
                !TryGetString(item, "status", out var status))
                throw new SubscriptionProviderException(false);

            payments.Add(new SubscriptionPaymentRecord(
                approvedAt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), price, currency, status));
        }

        return (subscription.NextPaymentDate, payments.ToArray());
    }

    private static string CreateExternalReference(string accountId, string plan, string checkoutAttemptId)
    {
        if (string.IsNullOrEmpty(checkoutAttemptId)) return $"{accountId}|{plan}";
        // This has already been validated by CreateCheckoutAsync. Keeping the
        // nonce in the provider reference lets a webhook safely adopt a response
        // that arrives before the browser request can persist its returned ID.
        return $"{accountId}|{plan}|{checkoutAttemptId.ToLowerInvariant()}";
    }

    private static bool TryNormalizeCheckoutAttemptId(string? value, out string normalized)
    {
        normalized = string.Empty;
        if (!Guid.TryParseExact(value, "N", out var parsed)) return false;
        normalized = parsed.ToString("N");
        return true;
    }

    private async Task<JsonDocument> SendAsync(
        HttpMethod method, string path, object? body, CancellationToken cancellationToken,
        bool providerMayHaveCreated = false)
    {
        if (string.IsNullOrWhiteSpace(_accessToken)) throw new SubscriptionProviderException(false);

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(RequestTimeout);
        using var request = new HttpRequestMessage(method, new Uri(ProviderOrigin, path));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        if (body is not null) request.Content = JsonContent.Create(body);

        try
        {
            using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
            if (!response.IsSuccessStatusCode)
            {
                // A just-created preapproval may not yet be readable. Never acknowledge
                // transient failures as a successfully handled notification.
                var retryable = response.StatusCode is HttpStatusCode.RequestTimeout or HttpStatusCode.TooManyRequests or HttpStatusCode.NotFound ||
                    (int)response.StatusCode >= 500;
                throw new SubscriptionProviderException(retryable);
            }

            if (response.Content.Headers.ContentLength > MaximumResponseBytes)
                throw new SubscriptionProviderException(false, providerMayHaveCreated);

            await using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
            using var buffer = new MemoryStream();
            var chunk = new byte[4096];
            int read;
            while ((read = await stream.ReadAsync(chunk.AsMemory(), timeout.Token)) > 0)
            {
                if (buffer.Length + read > MaximumResponseBytes)
                    throw new SubscriptionProviderException(false, providerMayHaveCreated);
                await buffer.WriteAsync(chunk.AsMemory(0, read), timeout.Token);
            }

            return JsonDocument.Parse(buffer.ToArray(), new JsonDocumentOptions { MaxDepth = 16 });
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new SubscriptionProviderException(true);
        }
        catch (HttpRequestException)
        {
            throw new SubscriptionProviderException(true);
        }
        catch (IOException)
        {
            throw new SubscriptionProviderException(true);
        }
        catch (JsonException)
        {
            throw new SubscriptionProviderException(false, providerMayHaveCreated);
        }
    }

    private static bool TryGetString(JsonElement root, string name, out string value)
    {
        value = string.Empty;
        if (!TryGetProperty(root, name, out var property) || property.ValueKind != JsonValueKind.String)
            return false;
        value = property.GetString() ?? string.Empty;
        return value.Length > 0 && value.Length <= 2048;
    }

    private static bool TryGetProperty(JsonElement root, string name, out JsonElement value)
    {
        value = default;
        if (root.ValueKind != JsonValueKind.Object) return false;
        var found = false;
        foreach (var property in root.EnumerateObject())
        {
            if (property.Name != name) continue;
            if (found) return false;
            value = property.Value;
            found = true;
        }
        return found;
    }
}

// Deliberately contains neither the provider body, URL, credentials nor a raw inner exception.
public sealed class SubscriptionProviderException(bool isTransient, bool providerMayHaveCreated = false)
    : Exception("No fue posible validar la respuesta del proveedor de suscripciones.")
{
    public bool IsTransient { get; } = isTransient;

    /// <summary>
    /// A failed/ambiguous successful POST must keep its local reservation because
    /// the provider may already have created a billable preapproval.
    /// </summary>
    public bool CanSafelyReleaseCheckoutReservation => !IsTransient && !providerMayHaveCreated;
}
