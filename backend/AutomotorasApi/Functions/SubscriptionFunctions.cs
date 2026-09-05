using AutomotorasApi.Models;
using AutomotorasApi.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Configuration;
using System.Globalization;
using System.Text.Json;

namespace AutomotorasApi.Functions;

public class SubscriptionFunctions(
    SubscriptionService subscriptionService,
    DealershipStorageService dealershipService,
    IConfiguration config,
    IRequestAuthorizer authorizer)
{
    private const int MaximumBodyBytes = 16 * 1024;
    private static readonly JsonSerializerOptions JsonOptions =
        new() { PropertyNameCaseInsensitive = true, MaxDepth = 16 };

    // POST /api/subscriptions/checkout
    // Body: { dealershipId, plan }. Legacy BackUrl is deliberately ignored.
    [Function("CreateSubscriptionCheckout")]
    public Task<IActionResult> CreateCheckout(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "subscriptions/checkout")] HttpRequest req) =>
        ExecuteAsync(req, async () =>
        {
            var user = await authorizer.RequireUserAsync(req);
            var request = await ReadCheckoutRequestAsync(req);
            var account = await RequireBillingAccountAsync(req, request.DealershipId, user);
            var payerEmail = string.IsNullOrWhiteSpace(account.LoginEmail) ? account.Email : account.LoginEmail;
            if (!System.Net.Mail.MailAddress.TryCreate(payerEmail, out var email) ||
                !string.Equals(email.Address, payerEmail, StringComparison.Ordinal))
                throw new ApiException(400, "billing_email_invalid", "La cuenta debe tener un correo de facturación válido.");

            // Reserve durably before POSTing to Mercado Pago. A retry after a
            // timeout must not create another billable preapproval while the first
            // remote request could still have succeeded.
            var reservation = await dealershipService.TryBeginCheckoutAsync(account.RowKey, request.Plan);
            if (reservation is null)
                throw new ApiException(409, "checkout_in_progress",
                    "Ya hay un intento de suscripcion en curso. Verifica su estado antes de iniciar otro.");

            string checkoutUrl;
            string subscriptionId;
            try
            {
                (checkoutUrl, subscriptionId) = await subscriptionService.CreateCheckoutAsync(
                    account.RowKey, request.Plan, payerEmail, reservation.AttemptId, req.HttpContext.RequestAborted);
            }
            catch (SubscriptionProviderException exception)
            {
                // Only a definite provider rejection is safe to release. Timeouts,
                // 5xx responses and malformed successful responses retain the nonce
                // for authenticated reconciliation or operator support.
                if (exception.CanSafelyReleaseCheckoutReservation)
                    await dealershipService.ReleaseCheckoutReservationAsync(account.RowKey, reservation.AttemptId);
                throw;
            }

            // Do not use the aborted browser token after a remote ID was returned:
            // persisting the binding is required for a later webhook/verification.
            if (!await dealershipService.CompletePendingCheckoutAsync(
                    account.RowKey, reservation.AttemptId, subscriptionId))
                throw new ApiException(409, "checkout_not_saved", "No se pudo vincular el intento. Verificá la suscripción antes de iniciar otro.");

            return new OkObjectResult(new CheckoutResponse(checkoutUrl));
        });

    // POST /api/subscriptions/webhook
    [Function("SubscriptionWebhook")]
    public Task<IActionResult> Webhook(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "subscriptions/webhook")] HttpRequest req) =>
        ExecuteAsync(req, async () =>
        {
            var secret = config["MercadoPago:WebhookSecret"];
            if (string.IsNullOrWhiteSpace(secret) || !TryGetWebhookMaxAge(out var maxAge))
                throw new ApiException(503, "webhook_unavailable", "La validación de notificaciones no está disponible.");

            var signatures = req.Headers["x-signature"];
            var requestIds = req.Headers["x-request-id"];
            var queryIds = req.Query["data.id"];
            if (signatures.Count != 1 || requestIds.Count != 1 || queryIds.Count != 1 ||
                !WebhookSignatureValidator.TryParseSignature(signatures[0], out var ts, out var v1))
                return Error(401, "webhook_signature_invalid", "La firma de la notificación no es válida.");

            using var doc = await ReadJsonBodyAsync(req);
            if (!TryReadNotification(doc.RootElement, out var eventType, out var resourceId))
                return Error(400, "webhook_payload_invalid", "La notificación no tiene un recurso válido.");

            if (!WebhookSignatureValidator.Validate(ts, v1, requestIds[0], queryIds[0],
                resourceId, secret, DateTimeOffset.UtcNow, maxAge))
                return Error(401, "webhook_signature_invalid", "La firma de la notificación no es válida.");

            // Authorized-payment IDs identify payments, not preapprovals. Do not feed
            // them to /preapproval or grant a plan from an unsigned body status.
            if (eventType is not ("subscription_preapproval" or "preapproval"))
                return new OkObjectResult(new { ignored = true });

            var updated = await ReconcileAsync(resourceId, null, req.HttpContext.RequestAborted);
            return new OkObjectResult(new { updated });
        });

    // POST /api/subscriptions/verify/{dealershipId}; the authorizer enforces CSRF.
    [Function("VerifySubscription")]
    public Task<IActionResult> Verify(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "subscriptions/verify/{dealershipId}")] HttpRequest req,
        string dealershipId) => ExecuteAsync(req, async () =>
        {
            var user = await authorizer.RequireUserAsync(req);
            var account = await RequireBillingAccountAsync(req, dealershipId, user);
            var checkedPendingId = account.PendingSubscriptionId;
            var updated = false;

            // A timeout or malformed successful POST can leave only the durable
            // nonce. Discover no more than one exact provider record, then have
            // ReconcileAsync fetch and validate its current snapshot before any
            // state is applied. The reservation remains locked on zero/ambiguous
            // results, so retrying Verify cannot create a second preapproval.
            if (string.IsNullOrWhiteSpace(checkedPendingId) &&
                !string.IsNullOrWhiteSpace(account.CheckoutAttemptId) &&
                SubscriptionCatalog.IsSupportedPlan(account.CheckoutPlan))
            {
                var recoveredId = await subscriptionService.FindPreapprovalIdForCheckoutAttemptAsync(
                    account.RowKey, account.CheckoutPlan, account.CheckoutAttemptId, req.HttpContext.RequestAborted);
                if (!string.IsNullOrWhiteSpace(recoveredId))
                    updated = await ReconcileAsync(recoveredId, account.RowKey, req.HttpContext.RequestAborted);
            }

            if (!string.IsNullOrWhiteSpace(checkedPendingId))
                updated = await ReconcileAsync(checkedPendingId, account.RowKey, req.HttpContext.RequestAborted);

            // A successful upgrade may have replaced the active ID. Do not fetch the
            // just-confirmed pending ID twice, or overwrite it using a stale active ID.
            var current = await GetRootAccountAsync(account.RowKey);
            if (!string.IsNullOrWhiteSpace(current.SubscriptionId) &&
                !SubscriptionState.SameId(current.SubscriptionId, checkedPendingId))
                updated |= await ReconcileAsync(current.SubscriptionId, account.RowKey, req.HttpContext.RequestAborted);

            var persisted = await GetRootAccountAsync(account.RowKey);
            return new OkObjectResult(new { status = persisted.SubscriptionStatus, updated });
        });

#if DEBUG
    // This function is absent from Release metadata, not merely hidden by a flag.
    [Function("SimulateSubscription")]
    public Task<IActionResult> Simulate(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "subscriptions/simulate")] HttpRequest req) =>
        ExecuteAsync(req, async () =>
        {
            if (!SubscriptionService.IsDevelopment(config) ||
                !bool.TryParse(config["EnableDevelopmentEndpoints"], out var enabled) || !enabled)
                return new NotFoundResult();

            var user = await authorizer.RequireUserAsync(req);
            var request = await ReadCheckoutRequestAsync(req);
            var account = await RequireBillingAccountAsync(req, request.DealershipId, user);
            var subscriptionId = $"sim-{Guid.NewGuid():N}";
            if (!await dealershipService.SavePendingCheckoutAsync(account.RowKey, request.Plan, subscriptionId) ||
                !await dealershipService.ApplySubscriptionAsync(account.RowKey, request.Plan, subscriptionId, "authorized"))
                throw new ApiException(409, "subscription_conflict", "La suscripción cambió. Volvé a consultar su estado.");

            var persisted = await GetRootAccountAsync(account.RowKey);
            return new OkObjectResult(new { ok = true, status = persisted.SubscriptionStatus });
        });
#endif

    // GET /api/subscriptions/info/{dealershipId}
    [Function("GetSubscriptionInfo")]
    public Task<IActionResult> GetInfo(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "subscriptions/info/{dealershipId}")] HttpRequest req,
        string dealershipId) => ExecuteAsync(req, async () =>
        {
            var user = await authorizer.RequireUserAsync(req);
            var account = await RequireBillingAccountAsync(req, dealershipId, user);
            if (string.IsNullOrWhiteSpace(account.SubscriptionId))
                return new OkObjectResult(new SubscriptionInfoDto(
                    account.SubscriptionStatus, string.Empty, Array.Empty<SubscriptionPaymentRecord>()));

            var subscription = await subscriptionService.GetPreapprovalStatusAsync(
                account.SubscriptionId, req.HttpContext.RequestAborted);
            if (!subscription.HasMatchingPlan(account)) throw new SubscriptionProviderException(false);

            // A billing read is also a safe reconciliation opportunity. Do not
            // report a stale local entitlement after Mercado Pago has already
            // canceled, paused, or rejected the current preapproval.
            await dealershipService.ApplySubscriptionAsync(
                subscription.AccountId, subscription.Plan, subscription.SubscriptionId, subscription.Status,
                subscription.CheckoutAttemptId, subscription.ProviderVersion);
            await CancelSupersededSubscriptionAsync(account.RowKey, req.HttpContext.RequestAborted);
            var persisted = await GetRootAccountAsync(account.RowKey);

            var (nextDate, payments) = await subscriptionService.GetSubscriptionInfoAsync(
                subscription, req.HttpContext.RequestAborted);
            return new OkObjectResult(new SubscriptionInfoDto(persisted.SubscriptionStatus, nextDate, payments));
        });

    private async Task<DealershipEntity> RequireBillingAccountAsync(
        HttpRequest req, string dealershipId, SessionUser user)
    {
        if (string.IsNullOrWhiteSpace(dealershipId))
            throw new ApiException(400, "dealership_required", "La automotora es obligatoria.");

        // requireActivePlan=false: expired accounts must still manage their billing.
        // MAIN's authorizer validates the session and anti-CSRF on all unsafe methods.
        var dealership = await authorizer.RequireDealershipAsync(req, dealershipId, false);
        var accountId = DealershipStorageService.GetAccountId(dealership);
        if (!string.Equals(accountId, user.AccountId, StringComparison.Ordinal))
            throw new ApiException(403, "billing_forbidden", "No tenés permiso para gestionar esta cuenta.");

        return await GetRootAccountAsync(accountId);
    }

    private async Task<DealershipEntity> GetRootAccountAsync(string accountId)
    {
        var account = await dealershipService.GetByIdAsync(accountId);
        if (account is null || !string.Equals(account.RowKey, accountId, StringComparison.Ordinal) ||
            !string.Equals(DealershipStorageService.GetAccountId(account), accountId, StringComparison.Ordinal))
            throw new ApiException(404, "billing_account_not_found", "La cuenta de facturación no existe.");
        return account;
    }

    private async Task<bool> ReconcileAsync(
        string subscriptionId, string? expectedAccountId, CancellationToken cancellationToken)
    {
        // The notification and browser never supply the status/price being applied.
        var state = await subscriptionService.GetPreapprovalStatusAsync(subscriptionId, cancellationToken);
        if (expectedAccountId is not null &&
            !string.Equals(expectedAccountId, state.AccountId, StringComparison.Ordinal))
            throw new SubscriptionProviderException(false);

        var account = await dealershipService.GetByIdAsync(state.AccountId);
        if (account is null || !state.References(account)) return false; // Unknown/obsolete ID: no adoption.
        if (!state.HasMatchingPlan(account)) throw new SubscriptionProviderException(false);

        // MAIN must re-read + compare again under ETag, retry conflicts boundedly and
        // return true only for a durable change. SubscriptionState.TryApplyTo captures
        // the required active/pending/obsolete/duplicate transition semantics.
        var updated = await dealershipService.ApplySubscriptionAsync(
            state.AccountId, state.Plan, state.SubscriptionId, state.Status, state.CheckoutAttemptId,
            state.ProviderVersion);
        await CancelSupersededSubscriptionAsync(state.AccountId, cancellationToken);
        return updated;
    }

    private async Task CancelSupersededSubscriptionAsync(string accountId, CancellationToken cancellationToken)
    {
        var account = await GetRootAccountAsync(accountId);
        var previousId = account.SupersededSubscriptionId;
        if (string.IsNullOrWhiteSpace(previousId) || SubscriptionState.SameId(previousId, account.SubscriptionId))
            return;

        // The old preapproval stays durable until the provider confirms the
        // cancellation. A webhook/verify retry will repeat this idempotent PUT if
        // the request fails, rather than leaving two recurring subscriptions.
        await subscriptionService.CancelPreapprovalAsync(previousId, cancellationToken);
        await dealershipService.ClearSupersededSubscriptionAsync(accountId, previousId);
    }

    private bool TryGetWebhookMaxAge(out TimeSpan maxAge)
    {
        maxAge = WebhookSignatureValidator.DefaultMaxAge;
        var configured = config["MercadoPago:WebhookMaxAgeSeconds"];
        if (configured is null) return true;
        if (!int.TryParse(configured, NumberStyles.None, CultureInfo.InvariantCulture, out var seconds) ||
            seconds <= 0 || seconds > WebhookSignatureValidator.MaximumMaxAge.TotalSeconds)
            return false;
        maxAge = TimeSpan.FromSeconds(seconds);
        return true;
    }

    private static async Task<CreateCheckoutRequest> ReadCheckoutRequestAsync(HttpRequest req)
    {
        using var doc = await ReadJsonBodyAsync(req);
        var request = doc.RootElement.Deserialize<CreateCheckoutRequest>(JsonOptions);
        if (request is null || string.IsNullOrWhiteSpace(request.DealershipId) ||
            !SubscriptionCatalog.IsSupportedPlan(request.Plan))
            throw new ApiException(400, "checkout_invalid", "Indicá una automotora y un plan válido: basic o plus.");
        return request;
    }

    private static async Task<JsonDocument> ReadJsonBodyAsync(HttpRequest req)
    {
        if (req.ContentLength > MaximumBodyBytes)
            throw new ApiException(413, "body_too_large", "La solicitud supera el tamaño permitido.");

        using var buffer = new MemoryStream();
        var chunk = new byte[4096];
        int read;
        while ((read = await req.Body.ReadAsync(chunk.AsMemory(), req.HttpContext.RequestAborted)) > 0)
        {
            if (buffer.Length + read > MaximumBodyBytes)
                throw new ApiException(413, "body_too_large", "La solicitud supera el tamaño permitido.");
            await buffer.WriteAsync(chunk.AsMemory(0, read), req.HttpContext.RequestAborted);
        }

        var doc = JsonDocument.Parse(buffer.ToArray(), new JsonDocumentOptions { MaxDepth = 16 });
        if (doc.RootElement.ValueKind != JsonValueKind.Object || HasDuplicateProperties(doc.RootElement))
        {
            doc.Dispose();
            throw new JsonException();
        }
        return doc;
    }

    private static bool HasDuplicateProperties(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Array)
            return element.EnumerateArray().Any(HasDuplicateProperties);
        if (element.ValueKind != JsonValueKind.Object) return false;
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        return element.EnumerateObject().Any(property =>
            !names.Add(property.Name) || HasDuplicateProperties(property.Value));
    }

    private static bool TryReadEventType(JsonElement root, out string eventType)
    {
        eventType = string.Empty;
        var hasType = root.TryGetProperty("type", out var type);
        var hasTopic = root.TryGetProperty("topic", out var topic);
        if ((!hasType && !hasTopic) || (hasType && type.ValueKind != JsonValueKind.String) ||
            (hasTopic && topic.ValueKind != JsonValueKind.String) ||
            (hasType && hasTopic && type.GetString() != topic.GetString()))
            return false;

        eventType = (hasType ? type.GetString() : topic.GetString()) ?? string.Empty;
        return !string.IsNullOrWhiteSpace(eventType);
    }

    private static bool TryReadNotification(JsonElement root, out string eventType, out string resourceId)
    {
        resourceId = string.Empty;
        if (!TryReadEventType(root, out eventType)) return false;

        JsonElement id;
        if (root.TryGetProperty("data", out var data))
        {
            if (data.ValueKind != JsonValueKind.Object || !data.TryGetProperty("id", out id)) return false;
        }
        else if (!root.TryGetProperty("topic", out _) || !root.TryGetProperty("id", out id))
        {
            return false;
        }

        var rawId = id.ValueKind switch
        {
            JsonValueKind.String => id.GetString(),
            JsonValueKind.Number when id.TryGetInt64(out var number) && number > 0 => number.ToString(CultureInfo.InvariantCulture),
            _ => null,
        };
        return WebhookSignatureValidator.TryNormalizeResourceId(rawId, out resourceId);
    }

    private static async Task<IActionResult> ExecuteAsync(HttpRequest req, Func<Task<IActionResult>> action)
    {
        req.HttpContext.Response.Headers["Cache-Control"] = "no-store";
        try
        {
            return await action();
        }
        catch (ApiException ex)
        {
            return Error(ex.StatusCode, ex.Code, ex.Message);
        }
        catch (JsonException)
        {
            return Error(400, "json_invalid", "El cuerpo de la solicitud debe ser un objeto JSON válido.");
        }
        catch (SubscriptionProviderException ex)
        {
            if (ex.IsTransient) req.HttpContext.Response.Headers["Retry-After"] = "30";
            return Error(ex.IsTransient ? 503 : 502, "subscription_provider_unavailable",
                "No se pudo confirmar la suscripción con el proveedor. Intentá consultar su estado más tarde.");
        }
        catch (Exception)
        {
            // Includes storage failures: never acknowledge a webhook before durable
            // processing, and never expose raw provider/storage/config exceptions.
            return Error(503, "subscription_unavailable", "No se pudo completar la operación de suscripción.");
        }
    }

    private static ObjectResult Error(int statusCode, string code, string message) =>
        new(new { code, error = message }) { StatusCode = statusCode };
}
