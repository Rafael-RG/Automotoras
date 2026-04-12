using AutomotorasApi.Models;
using AutomotorasApi.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Configuration;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace AutomotorasApi.Functions;

public class SubscriptionFunctions(
    SubscriptionService subscriptionService,
    DealershipStorageService dealershipService,
    IConfiguration config)
{
    private static readonly JsonSerializerOptions JsonOptions =
        new() { PropertyNameCaseInsensitive = true };

    private bool ValidateWebhookSignature(HttpRequest req, string body)
    {
        var secret = config["MercadoPago:WebhookSecret"];
        if (string.IsNullOrEmpty(secret)) return true; // skip validation if not configured

        // x-signature: ts=<ts>,v1=<hash>
        var signature = req.Headers["x-signature"].FirstOrDefault() ?? "";
        var requestId = req.Headers["x-request-id"].FirstOrDefault() ?? "";

        var ts = "";
        var v1 = "";
        foreach (var part in signature.Split(','))
        {
            var kv = part.Split('=', 2);
            if (kv.Length == 2)
            {
                if (kv[0] == "ts") ts = kv[1];
                else if (kv[0] == "v1") v1 = kv[1];
            }
        }

        if (string.IsNullOrEmpty(ts) || string.IsNullOrEmpty(v1)) return false;

        // Get data.id from query string (MP sends it as ?data.id=xxx)
        var dataId = req.Query["data.id"].FirstOrDefault() ?? "";

        var manifest = $"id:{dataId};request-id:{requestId};ts:{ts};";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var expected = Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(manifest))).ToLower();

        return expected == v1;
    }

    // POST /api/subscriptions/checkout
    // Body: { dealershipId, plan, backUrl }
    [Function("CreateSubscriptionCheckout")]
    public async Task<IActionResult> CreateCheckout(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "subscriptions/checkout")] HttpRequest req)
    {
        var body = await new StreamReader(req.Body).ReadToEndAsync();
        var request = JsonSerializer.Deserialize<CreateCheckoutRequest>(body, JsonOptions);

        if (request is null || string.IsNullOrWhiteSpace(request.DealershipId) || string.IsNullOrWhiteSpace(request.Plan))
            return new BadRequestObjectResult("dealershipId y plan son obligatorios.");

        var dealership = await dealershipService.GetByIdAsync(request.DealershipId);
        if (dealership is null)
            return new NotFoundObjectResult("Automotora no encontrada.");

        var backUrl = string.IsNullOrWhiteSpace(request.BackUrl) || request.BackUrl.Contains("localhost")
            ? "https://redautos.com/admin?sub=ok"
            : request.BackUrl;

        // MP requires a valid payer email
        var payerEmail = string.IsNullOrWhiteSpace(dealership.Email)
            ? "test_user@redautos.com"
            : dealership.Email;

        try
        {
            var checkoutUrl = await subscriptionService.CreateCheckoutAsync(
                request.DealershipId, request.Plan, payerEmail, backUrl);

            // Mark as pending immediately
            await dealershipService.UpdatePlanAsync(
                request.DealershipId, request.Plan, "", "pending");

            return new OkObjectResult(new CheckoutResponse(checkoutUrl));
        }
        catch (Exception ex)
        {
            return new ObjectResult(new { error = ex.Message }) { StatusCode = 502 };
        }
    }

    // POST /api/subscriptions/webhook
    // Called by MercadoPago when subscription status changes
    [Function("SubscriptionWebhook")]
    public async Task<IActionResult> Webhook(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "subscriptions/webhook")] HttpRequest req)
    {
        var body = await new StreamReader(req.Body).ReadToEndAsync();

        if (!ValidateWebhookSignature(req, body))
            return new UnauthorizedResult();

        string? preapprovalId = null;

        try
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;

            // MercadoPago sends either { topic, id } or { type, data: { id } }
            if (root.TryGetProperty("type", out var typeProp) && typeProp.GetString() == "preapproval")
            {
                if (root.TryGetProperty("data", out var dataProp) && dataProp.TryGetProperty("id", out var dataId))
                    preapprovalId = dataId.GetString();
            }
            else if (root.TryGetProperty("topic", out var topic) && topic.GetString() == "preapproval")
            {
                if (root.TryGetProperty("id", out var idProp))
                    preapprovalId = idProp.GetString();
            }
        }
        catch { /* ignore parse errors */ }

        if (string.IsNullOrWhiteSpace(preapprovalId))
            return new OkResult();

        var info = await subscriptionService.GetPreapprovalStatusAsync(preapprovalId);
        if (info is null)
            return new OkResult();

        var (dealershipId, plan, status, subscriptionId) = info.Value;

        // Only activate plan if authorized
        if (status == "authorized")
        {
            await dealershipService.UpdatePlanAsync(dealershipId, plan, subscriptionId, "authorized");
        }
        else
        {
            await dealershipService.UpdatePlanAsync(dealershipId, plan, subscriptionId, status);
        }

        return new OkResult();
    }

    // POST /api/subscriptions/simulate  (SOLO DESARROLLO)
    // Body: { dealershipId, plan }
    [Function("SimulateSubscription")]
    public async Task<IActionResult> Simulate(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "subscriptions/simulate")] HttpRequest req)
    {
        var env = config["AZURE_FUNCTIONS_ENVIRONMENT"] ?? "";
        if (env != "Development")
            return new NotFoundResult();

        var body = await new StreamReader(req.Body).ReadToEndAsync();
        var request = JsonSerializer.Deserialize<CreateCheckoutRequest>(body, JsonOptions);

        if (request is null || string.IsNullOrWhiteSpace(request.DealershipId) || string.IsNullOrWhiteSpace(request.Plan))
            return new BadRequestObjectResult("dealershipId y plan son obligatorios.");

        await dealershipService.UpdatePlanAsync(request.DealershipId, request.Plan, "sim-" + Guid.NewGuid(), "authorized");
        return new OkObjectResult(new { ok = true });
    }
}
