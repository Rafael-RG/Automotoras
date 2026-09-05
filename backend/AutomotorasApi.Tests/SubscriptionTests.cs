using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AutomotorasApi.Functions;
using AutomotorasApi.Models;
using AutomotorasApi.Services;
using Azure;
using Azure.Data.Tables;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Configuration;
using Moq;
using Xunit;

namespace AutomotorasApi.Tests;

// All HTTP and Tables access is intercepted. No test needs local settings, Azurite,
// provider credentials or a network. MAIN owns test-project setup and execution.
public class SubscriptionTests
{
    private const string AccountId = "account-1";
    private const string ActiveId = "active123";
    private const string PendingId = "pending123";
    private const string SyntheticSecret = "synthetic-only-webhook-fixture-not-a-real-secret";

    [Theory]
    [InlineData("basic", 2590)]
    [InlineData("plus", 3990)]
    public void Catalog_ContainsOnlyPublicServerPrices(string plan, int amount)
    {
        Assert.True(SubscriptionCatalog.TryGetPlan(plan, out var definition));
        Assert.Equal((decimal)amount, definition.Amount);
        Assert.Equal("UYU", SubscriptionCatalog.Currency);
    }

    [Theory]
    [InlineData("test")]
    [InlineData("Basic")]
    [InlineData("basic ")]
    [InlineData("enterprise")]
    [InlineData("")]
    [InlineData(null)]
    public void Catalog_RejectsTestAndUnknownPlans(string? plan) =>
        Assert.False(SubscriptionCatalog.IsSupportedPlan(plan));

    [Theory]
    [InlineData("basic", 2590)]
    [InlineData("plus", 3990)]
    public void ProviderSnapshot_RequiresExactCatalogPriceAndBoundId(string plan, int price)
    {
        using var doc = JsonDocument.Parse(Snapshot(plan: plan, amount: price));
        Assert.True(SubscriptionService.TryValidatePreapproval(doc.RootElement, ActiveId.ToUpperInvariant(), out var state));
        Assert.Equal(new SubscriptionState(AccountId, plan, ActiveId, "authorized", ProviderVersion: 1), state);
    }

    [Theory]
    [InlineData("test", "15", "UYU", 1, "months")]
    [InlineData("basic", "15", "UYU", 1, "months")]
    [InlineData("basic", "2590.01", "UYU", 1, "months")]
    [InlineData("basic", "2590", "USD", 1, "months")]
    [InlineData("basic", "2590", "uyu", 1, "months")]
    [InlineData("basic", "2590", "UYU", 12, "months")]
    [InlineData("basic", "2590", "UYU", 1, "days")]
    [InlineData("plus", "2590", "UYU", 1, "months")]
    public void ProviderSnapshot_RejectsInvalidFinancialTerms(string plan, string amount, string currency, int frequency, string frequencyType)
    {
        using var doc = JsonDocument.Parse(Snapshot(plan: plan, amount: decimal.Parse(amount, CultureInfo.InvariantCulture),
            currency: currency, frequency: frequency, frequencyType: frequencyType));
        Assert.False(SubscriptionService.TryValidatePreapproval(doc.RootElement, ActiveId, out _));
    }

    [Theory]
    [InlineData("other123", "account-1|basic", "authorized")]
    [InlineData("active123", "account-1", "authorized")]
    [InlineData("active123", "|basic", "authorized")]
    [InlineData("active123", "account-1|basic|extra", "authorized")]
    [InlineData("active123", "account-1|basic ", "authorized")]
    [InlineData("active123", "account-1|basic", "approved")]
    public void ProviderSnapshot_RejectsWrongIdReferenceAndUnknownStatus(string id, string reference, string status)
    {
        using var doc = JsonDocument.Parse(Snapshot(id: id, reference: reference, status: status));
        Assert.False(SubscriptionService.TryValidatePreapproval(doc.RootElement, ActiveId, out _));
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("[]")]
    [InlineData("null")]
    [InlineData("{\"id\":123}")]
    [InlineData("{\"id\":\"active123\",\"external_reference\":\"account-1|basic\",\"status\":\"authorized\",\"auto_recurring\":null}")]
    public void ProviderSnapshot_RejectsMissingOrMalformedData(string json)
    {
        using var doc = JsonDocument.Parse(json);
        Assert.False(SubscriptionService.TryValidatePreapproval(doc.RootElement, ActiveId, out _));
    }

    [Fact]
    public void ProviderSnapshot_RejectsDuplicateFinancialProperties()
    {
        var json = Snapshot().Replace("\"transaction_amount\":2590", "\"transaction_amount\":15,\"transaction_amount\":2590", StringComparison.Ordinal);
        using var doc = JsonDocument.Parse(json);
        Assert.False(SubscriptionService.TryValidatePreapproval(doc.RootElement, ActiveId, out _));
    }

    [Fact]
    public void AuthorizedPending_PromotesOnlyMatchingPlanAndClearsPending()
    {
        var account = Account();
        var state = new SubscriptionState(AccountId, "plus", PendingId, "authorized");
        Assert.True(state.TryApplyTo(account));
        Assert.Equal("plus", account.Plan);
        Assert.Equal(PendingId, account.SubscriptionId);
        Assert.Equal("authorized", account.SubscriptionStatus);
        Assert.Empty(account.PendingSubscriptionId);
        Assert.Empty(account.PendingPlan);
        Assert.False(state.TryApplyTo(account));
    }

    [Theory]
    [InlineData("cancelled")]
    [InlineData("rejected")]
    [InlineData("failed")]
    public void FailedPending_ClearsOnlyPendingAndKeepsActivePlan(string status)
    {
        var account = Account();
        var state = new SubscriptionState(AccountId, "plus", PendingId, status);
        Assert.True(state.TryApplyTo(account));
        Assert.Equal(ActiveId, account.SubscriptionId);
        Assert.Equal("basic", account.Plan);
        Assert.Equal("authorized", account.SubscriptionStatus);
        Assert.Empty(account.PendingSubscriptionId);
        Assert.Empty(account.PendingPlan);
        Assert.False(state.TryApplyTo(account));
    }

    [Theory]
    [InlineData("pending")]
    [InlineData("paused")]
    public void UnconfirmedPending_DoesNotGrantOrRevokeActivePlan(string status)
    {
        var account = Account();
        var before = JsonSerializer.Serialize(account);
        Assert.False(new SubscriptionState(AccountId, "plus", PendingId, status).TryApplyTo(account));
        Assert.Equal(before, JsonSerializer.Serialize(account));
    }

    [Theory]
    [InlineData("pending")]
    [InlineData("paused")]
    [InlineData("cancelled")]
    public void ActiveTransition_PreservesAnotherPendingCheckout(string status)
    {
        var account = Account();
        var state = new SubscriptionState(AccountId, "basic", ActiveId, status);
        Assert.True(state.TryApplyTo(account));
        Assert.Equal(SubscriptionState.NormalizeStatus(status), account.SubscriptionStatus);
        Assert.Equal("basic", account.Plan);
        Assert.Equal(ActiveId, account.SubscriptionId);
        Assert.Equal(PendingId, account.PendingSubscriptionId);
        Assert.Equal("plus", account.PendingPlan);
        Assert.False(state.TryApplyTo(account));
    }

    [Fact]
    public void DuplicateActive_DoesNotClearNewPendingCheckout()
    {
        var account = Account();
        var before = JsonSerializer.Serialize(account);
        Assert.False(new SubscriptionState(AccountId, "basic", ActiveId, "authorized").TryApplyTo(account));
        Assert.Equal(before, JsonSerializer.Serialize(account));
    }

    [Theory]
    [InlineData("old123", "basic", "account-1")]
    [InlineData("pending123", "basic", "account-1")]
    [InlineData("active123", "plus", "account-1")]
    [InlineData("active123", "basic", "other-account")]
    [InlineData("active123", "test", "account-1")]
    public void ObsoleteWrongAccountOrWrongPlan_CannotMutateRoot(string id, string plan, string accountId)
    {
        var account = Account();
        var before = JsonSerializer.Serialize(account);
        Assert.False(new SubscriptionState(accountId, plan, id, "authorized").TryApplyTo(account));
        Assert.Equal(before, JsonSerializer.Serialize(account));
    }

    [Fact]
    public void SnapshotCannotMutateABranchEvenWhenItsRowKeyMatchesReference()
    {
        var branch = Account();
        branch.OwnerAccountId = "another-root";
        Assert.False(new SubscriptionState(AccountId, "basic", ActiveId, "cancelled").TryApplyTo(branch));
        Assert.Equal("authorized", branch.SubscriptionStatus);
    }

    [Fact]
    public void FirstCheckout_RemainsUnpaidUntilMatchingPendingIsAuthorized()
    {
        var account = Account();
        account.SubscriptionId = string.Empty;
        account.SubscriptionStatus = string.Empty;
        Assert.False(new SubscriptionState(AccountId, "plus", PendingId, "pending").TryApplyTo(account));
        Assert.Empty(account.SubscriptionStatus);
        Assert.True(new SubscriptionState(AccountId, "plus", PendingId, "authorized").TryApplyTo(account));
        Assert.Equal(PendingId, account.SubscriptionId);
    }

    [Fact]
    public void OldActiveNotification_AfterUpgradeCannotRestoreOldPlan()
    {
        var account = Account();
        Assert.True(new SubscriptionState(AccountId, "plus", PendingId, "authorized").TryApplyTo(account));
        Assert.False(new SubscriptionState(AccountId, "basic", ActiveId, "authorized").TryApplyTo(account));
        Assert.Equal("plus", account.Plan);
        Assert.Equal(PendingId, account.SubscriptionId);
    }

    [Fact]
    public void NewerCanceledSnapshot_RejectsAnOlderAuthorizedSnapshot()
    {
        var account = Account();
        Assert.True(new SubscriptionState(AccountId, "basic", ActiveId, "canceled", ProviderVersion: 2).TryApplyTo(account));

        Assert.False(new SubscriptionState(AccountId, "basic", ActiveId, "authorized", ProviderVersion: 1).TryApplyTo(account));

        Assert.Equal("canceled", account.SubscriptionStatus);
        Assert.Equal(2, account.SubscriptionProviderVersion);
    }

    [Fact]
    public void PausedActive_IsRetainedForCancellationWhenAnUpgradeAuthorizes()
    {
        var account = Account();
        account.SubscriptionStatus = "paused";

        Assert.True(new SubscriptionState(AccountId, "plus", PendingId, "authorized").TryApplyTo(account));

        Assert.Equal(PendingId, account.SubscriptionId);
        Assert.Equal("authorized", account.SubscriptionStatus);
        Assert.Equal(ActiveId, account.SupersededSubscriptionId);
    }

    [Fact]
    public void Callback_DefaultsToConfiguredProductionOrigin() =>
        Assert.Equal("https://redautos.com.uy/admin?sub=ok", SubscriptionService.GetCheckoutBackUrl(Config()));

    [Theory]
    [InlineData("Production", "https://billing.example.invalid", "https://billing.example.invalid/admin?sub=ok")]
    [InlineData("Development", "http://localhost:3000", "http://localhost:3000/admin?sub=ok")]
    [InlineData("Development", "http://127.0.0.1:3000", "http://127.0.0.1:3000/admin?sub=ok")]
    public void Callback_AcceptsOnlyConfiguredSecureOrDevelopmentLoopbackOrigin(string environment, string origin, string expected) =>
        Assert.Equal(expected, SubscriptionService.GetCheckoutBackUrl(Config(environment, origin)));

    [Theory]
    [InlineData("Production", "http://billing.example.invalid")]
    [InlineData("Production", "https://localhost:3000")]
    [InlineData("Production", "http://localhost:3000")]
    [InlineData("Development", "http://localhost.attacker.invalid")]
    [InlineData("Development", "http://example.invalid")]
    [InlineData("Production", "https://user:pass@example.invalid")]
    [InlineData("Production", "https://example.invalid/return")]
    [InlineData("Production", "https://example.invalid/?return=https://other.invalid")]
    [InlineData("Production", "https://example.invalid/#return")]
    [InlineData("Production", "javascript:alert(1)")]
    [InlineData("Production", "")]
    public void Callback_RejectsUnsafeAndAmbiguousConfiguration(string environment, string origin) =>
        Assert.Throws<InvalidOperationException>(() => SubscriptionService.GetCheckoutBackUrl(Config(environment, origin)));

    [Theory]
    [InlineData("Production", false, "https://checkout.example.invalid/live")]
    [InlineData("Production", true, "https://checkout.example.invalid/live")]
    [InlineData("Development", false, "https://checkout.example.invalid/live")]
    [InlineData("Development", true, "https://checkout.example.invalid/sandbox")]
    public async Task Checkout_SandboxRequiresBothExplicitFlagAndDevelopment(string environment, bool sandbox, string expectedUrl)
    {
        using var handler = new RecordingHandler((_, _) => Task.FromResult(JsonResponse(CheckoutResponseJson())));
        using var http = new HttpClient(handler);
        var service = new SubscriptionService(Config(environment, sandbox: sandbox), http);

        var (url, id) = await service.CreateCheckoutAsync(AccountId, "basic", "owner@example.invalid");
        Assert.Equal(expectedUrl, url);
        Assert.Equal(PendingId, id);
        Assert.True(handler.SawCancelableToken);
        using var body = JsonDocument.Parse(Assert.Single(handler.Bodies));
        Assert.Equal($"{AccountId}|basic", body.RootElement.GetProperty("external_reference").GetString());
        Assert.Equal(2590m, body.RootElement.GetProperty("auto_recurring").GetProperty("transaction_amount").GetDecimal());
        Assert.Equal("UYU", body.RootElement.GetProperty("auto_recurring").GetProperty("currency_id").GetString());
        Assert.Equal("https://redautos.com.uy/admin?sub=ok", body.RootElement.GetProperty("back_url").GetString());
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Development")]
    public async Task Checkout_RejectsTestPlanBeforeSendingHttp(string environment)
    {
        using var handler = new RecordingHandler((_, _) => throw new InvalidOperationException("Unexpected HTTP"));
        using var http = new HttpClient(handler);
        var service = new SubscriptionService(Config(environment), http);
        await Assert.ThrowsAsync<ArgumentException>(() => service.CreateCheckoutAsync(AccountId, "test", "owner@example.invalid"));
        Assert.Empty(handler.Paths);
    }

    [Fact]
    public async Task Checkout_DoesNotFallBackFromMissingExplicitSandboxUrlToLive()
    {
        using var handler = new RecordingHandler((_, _) => Task.FromResult(JsonResponse(
            JsonSerializer.Serialize(new { id = PendingId, init_point = "https://checkout.example.invalid/live" }))));
        using var http = new HttpClient(handler);
        var service = new SubscriptionService(Config("Development", sandbox: true), http);
        await Assert.ThrowsAsync<SubscriptionProviderException>(() => service.CreateCheckoutAsync(AccountId, "basic", "owner@example.invalid"));
    }

    [Theory]
    [InlineData(400, false)]
    [InlineData(401, false)]
    [InlineData(404, true)]
    [InlineData(408, true)]
    [InlineData(429, true)]
    [InlineData(500, true)]
    [InlineData(503, true)]
    public async Task ProviderErrors_AreClassifiedAndDoNotExposeResponseBody(int statusCode, bool transient)
    {
        using var handler = new RecordingHandler((_, _) => Task.FromResult(
            new HttpResponseMessage((HttpStatusCode)statusCode) { Content = new StringContent("private-provider-detail") }));
        using var http = new HttpClient(handler);
        var service = new SubscriptionService(Config(), http);
        var error = await Assert.ThrowsAsync<SubscriptionProviderException>(() => service.GetPreapprovalStatusAsync(ActiveId));
        Assert.Equal(transient, error.IsTransient);
        Assert.DoesNotContain("private-provider-detail", error.ToString());
        Assert.Null(error.InnerException);
        Assert.Single(handler.Paths); // No automatic payment/provider retries.
    }

    [Fact]
    public async Task ProviderTimeout_IsRetryableWithoutLeakingRawException()
    {
        using var handler = new RecordingHandler((_, _) => throw new TaskCanceledException("private-timeout-detail"));
        using var http = new HttpClient(handler);
        var service = new SubscriptionService(Config(), http);
        var error = await Assert.ThrowsAsync<SubscriptionProviderException>(() => service.GetPreapprovalStatusAsync(ActiveId));
        Assert.True(error.IsTransient);
        Assert.DoesNotContain("private-timeout-detail", error.ToString());
        Assert.True(handler.SawCancelableToken);
        Assert.Equal(TimeSpan.FromSeconds(15), SubscriptionService.RequestTimeout);
    }

    [Fact]
    public async Task ProviderSuccess_WithMismatchedReturnedIdIsRejected()
    {
        using var handler = new RecordingHandler((_, _) => Task.FromResult(JsonResponse(Snapshot(id: "different123"))));
        using var http = new HttpClient(handler);
        var service = new SubscriptionService(Config(), http);
        await Assert.ThrowsAsync<SubscriptionProviderException>(() => service.GetPreapprovalStatusAsync(ActiveId));
    }

    [Theory]
    [InlineData("not-json")]
    [InlineData("{\"status\":\"authorized\"}")]
    public async Task MalformedProviderSuccess_IsNotSilentlyAcknowledged(string body)
    {
        using var handler = new RecordingHandler((_, _) => Task.FromResult(JsonResponse(body)));
        using var http = new HttpClient(handler);
        var service = new SubscriptionService(Config(), http);
        await Assert.ThrowsAsync<SubscriptionProviderException>(() => service.GetPreapprovalStatusAsync(ActiveId));
    }

    [Fact]
    public async Task ProviderResponseSize_IsBounded()
    {
        using var handler = new RecordingHandler((_, _) => Task.FromResult(JsonResponse(new string('x', 256 * 1024 + 1))));
        using var http = new HttpClient(handler);
        var service = new SubscriptionService(Config(), http);
        await Assert.ThrowsAsync<SubscriptionProviderException>(() => service.GetPreapprovalStatusAsync(ActiveId));
    }

    [Theory]
    [InlineData("checkout")]
    [InlineData("verify")]
    [InlineData("info")]
    public async Task PrivateEndpoints_RequireSessionBeforeProviderOrStorage(string endpoint)
    {
        using var handler = new RecordingHandler((_, _) => throw new InvalidOperationException("Unexpected provider call"));
        using var http = new HttpClient(handler);
        var storage = Storage();
        var auth = new Mock<IRequestAuthorizer>(MockBehavior.Strict);
        var req = Request("POST", JsonSerializer.Serialize(new { dealershipId = AccountId, plan = "basic" }));
        auth.Setup(a => a.RequireUserAsync(req)).ThrowsAsync(new ApiException(401, "session_required", "Iniciá sesión."));
        var functions = new SubscriptionFunctions(new SubscriptionService(Config(), http), storage.Object, Config(), auth.Object);

        var result = endpoint switch
        {
            "checkout" => await functions.CreateCheckout(req),
            "verify" => await functions.Verify(req, AccountId),
            _ => await functions.GetInfo(req, AccountId),
        };
        Assert.Equal(401, Assert.IsType<ObjectResult>(result).StatusCode);
        Assert.Empty(handler.Paths);
        storage.Verify(s => s.GetByIdAsync(It.IsAny<string>()), Times.Never);
    }

    [Theory]
    [InlineData("checkout")]
    [InlineData("verify")]
    [InlineData("info")]
    public async Task PrivateEndpoints_RejectForeignAccountEvenForPlatformAdmin(string endpoint)
    {
        using var handler = new RecordingHandler((_, _) => throw new InvalidOperationException("Unexpected provider call"));
        using var http = new HttpClient(handler);
        var storage = Storage();
        var auth = new Mock<IRequestAuthorizer>(MockBehavior.Strict);
        var req = Request("POST", JsonSerializer.Serialize(new { dealershipId = "foreign-branch", plan = "basic" }));
        auth.Setup(a => a.RequireUserAsync(req)).ReturnsAsync(new SessionUser(AccountId, true));
        auth.Setup(a => a.RequireDealershipAsync(req, "foreign-branch", false))
            .ReturnsAsync(new DealershipEntity { RowKey = "foreign-branch", OwnerAccountId = "foreign-account" });
        var functions = new SubscriptionFunctions(new SubscriptionService(Config(), http), storage.Object, Config(), auth.Object);

        var result = endpoint switch
        {
            "checkout" => await functions.CreateCheckout(req),
            "verify" => await functions.Verify(req, "foreign-branch"),
            _ => await functions.GetInfo(req, "foreign-branch"),
        };
        Assert.Equal(403, Assert.IsType<ObjectResult>(result).StatusCode);
        Assert.Empty(handler.Paths);
        storage.Verify(s => s.GetByIdAsync(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task Checkout_CsrfRejectionStopsBeforeProviderOrStorage()
    {
        var root = Account();
        var storage = Storage();
        var req = Request("POST", JsonSerializer.Serialize(new
        {
            dealershipId = "branch-1", plan = "plus", backUrl = "https://attacker.invalid/return",
        }));
        var auth = Authorized(req, new DealershipEntity { RowKey = "branch-1", OwnerAccountId = AccountId });
        using var handler = new RecordingHandler((_, _) => Task.FromResult(JsonResponse(CheckoutResponseJson())));
        using var http = new HttpClient(handler);
        var functions = new SubscriptionFunctions(new SubscriptionService(Config(), http), storage.Object, Config(), auth.Object);

        auth.Setup(a => a.RequireDealershipAsync(req, "branch-1", false))
            .ThrowsAsync(new ApiException(403, "csrf_invalid", "La validación de la solicitud falló."));
        Assert.Equal(403, Assert.IsType<ObjectResult>(await functions.CreateCheckout(req)).StatusCode);
        Assert.Empty(handler.Paths);
        Assert.Equal(ActiveId, root.SubscriptionId);
        Assert.Equal("authorized", root.SubscriptionStatus);
        storage.Verify(s => s.GetByIdAsync(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task Checkout_BillsRootAndIgnoresClientBackUrlWithoutReplacingActiveState()
    {
        var root = Account();
        root.PendingPlan = string.Empty;
        root.PendingSubscriptionId = string.Empty;
        var storage = Storage(out var table);
        storage.Setup(s => s.GetByIdAsync(AccountId)).ReturnsAsync(root);
        table.Setup(t => t.UpdateEntityAsync(It.IsAny<DealershipEntity>(), It.IsAny<ETag>(),
                It.IsAny<TableUpdateMode>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Mock.Of<Response>());
        var req = Request("POST", JsonSerializer.Serialize(new
        {
            dealershipId = "branch-1", plan = "plus", backUrl = "https://attacker.invalid/return",
        }));
        var branch = new DealershipEntity
        {
            RowKey = "branch-1", OwnerAccountId = AccountId, Email = "branch@example.invalid",
        };
        var auth = Authorized(req, branch);
        using var handler = new RecordingHandler((_, _) => Task.FromResult(JsonResponse(CheckoutResponseJson())));
        using var http = new HttpClient(handler);
        var functions = new SubscriptionFunctions(new SubscriptionService(Config(), http), storage.Object, Config(), auth.Object);

        var response = Assert.IsType<OkObjectResult>(await functions.CreateCheckout(req));
        Assert.Equal("https://checkout.example.invalid/live", Assert.IsType<CheckoutResponse>(response.Value).CheckoutUrl);
        using var body = JsonDocument.Parse(Assert.Single(handler.Bodies));
        Assert.Matches($"^{AccountId}\\|plus\\|[0-9a-f]{{32}}$",
            body.RootElement.GetProperty("external_reference").GetString() ?? string.Empty);
        Assert.Equal("owner@example.invalid", body.RootElement.GetProperty("payer_email").GetString());
        Assert.Equal("https://redautos.com.uy/admin?sub=ok", body.RootElement.GetProperty("back_url").GetString());
        Assert.Equal("basic", root.Plan);
        Assert.Equal(ActiveId, root.SubscriptionId);
        Assert.Equal("authorized", root.SubscriptionStatus);
        Assert.Equal("plus", root.PendingPlan);
        Assert.Equal(PendingId, root.PendingSubscriptionId);
        table.Verify(t => t.UpdateEntityAsync(It.Is<DealershipEntity>(e => e.RowKey == AccountId),
            It.IsAny<ETag>(), It.IsAny<TableUpdateMode>(), It.IsAny<CancellationToken>()), Times.Exactly(2));
        auth.Verify(a => a.RequireDealershipAsync(req, branch.RowKey, false), Times.Once);
    }

    [Fact]
    public async Task Checkout_ExistingReservation_BlocksProviderPost()
    {
        var root = Account();
        root.PendingPlan = string.Empty;
        root.PendingSubscriptionId = string.Empty;
        root.CheckoutAttemptId = "0123456789abcdef0123456789abcdef";
        root.CheckoutPlan = "plus";
        var storage = Storage();
        storage.Setup(s => s.GetByIdAsync(AccountId)).ReturnsAsync(root);
        var req = Request("POST", JsonSerializer.Serialize(new { dealershipId = "branch-1", plan = "plus" }));
        var branch = new DealershipEntity { RowKey = "branch-1", OwnerAccountId = AccountId };
        using var handler = new RecordingHandler((_, _) => throw new InvalidOperationException("Provider must not be called"));
        using var http = new HttpClient(handler);
        var functions = new SubscriptionFunctions(new SubscriptionService(Config(), http), storage.Object, Config(), Authorized(req, branch).Object);

        var result = Assert.IsType<ObjectResult>(await functions.CreateCheckout(req));

        Assert.Equal(409, result.StatusCode);
        Assert.Empty(handler.Paths);
    }

    [Fact]
    public async Task Checkout_LegacyPendingSubscription_BlocksASecondProviderPost()
    {
        var root = Account();
        root.SubscriptionId = PendingId;
        root.SubscriptionStatus = "pending";
        root.Plan = "plus";
        root.PendingPlan = string.Empty;
        root.PendingSubscriptionId = string.Empty;
        var storage = Storage();
        storage.Setup(s => s.GetByIdAsync(AccountId)).ReturnsAsync(root);
        var req = Request("POST", JsonSerializer.Serialize(new { dealershipId = "branch-1", plan = "plus" }));
        var branch = new DealershipEntity { RowKey = "branch-1", OwnerAccountId = AccountId };
        using var handler = new RecordingHandler((_, _) => throw new InvalidOperationException("Provider must not be called"));
        using var http = new HttpClient(handler);
        var functions = new SubscriptionFunctions(new SubscriptionService(Config(), http), storage.Object, Config(), Authorized(req, branch).Object);

        var result = Assert.IsType<ObjectResult>(await functions.CreateCheckout(req));

        Assert.Equal(409, result.StatusCode);
        Assert.Empty(handler.Paths);
    }

    [Fact]
    public async Task Checkout_TimeoutRetainsReservationAndBlocksRetry()
    {
        var root = Account();
        root.PendingPlan = string.Empty;
        root.PendingSubscriptionId = string.Empty;
        var storage = Storage(out var table);
        storage.Setup(s => s.GetByIdAsync(AccountId)).ReturnsAsync(root);
        table.Setup(t => t.UpdateEntityAsync(It.IsAny<DealershipEntity>(), It.IsAny<ETag>(),
                It.IsAny<TableUpdateMode>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Mock.Of<Response>());
        var branch = new DealershipEntity { RowKey = "branch-1", OwnerAccountId = AccountId };
        var first = Request("POST", JsonSerializer.Serialize(new { dealershipId = "branch-1", plan = "plus" }));
        var second = Request("POST", JsonSerializer.Serialize(new { dealershipId = "branch-1", plan = "plus" }));
        using var handler = new RecordingHandler((_, _) => throw new TaskCanceledException("synthetic timeout"));
        using var http = new HttpClient(handler);
        var auth = new Mock<IRequestAuthorizer>(MockBehavior.Strict);
        auth.Setup(a => a.RequireUserAsync(first)).ReturnsAsync(new SessionUser(AccountId, false));
        auth.Setup(a => a.RequireDealershipAsync(first, "branch-1", false)).ReturnsAsync(branch);
        auth.Setup(a => a.RequireUserAsync(second)).ReturnsAsync(new SessionUser(AccountId, false));
        auth.Setup(a => a.RequireDealershipAsync(second, "branch-1", false)).ReturnsAsync(branch);
        var functions = new SubscriptionFunctions(new SubscriptionService(Config(), http), storage.Object, Config(), auth.Object);

        Assert.Equal(503, Assert.IsType<ObjectResult>(await functions.CreateCheckout(first)).StatusCode);
        Assert.False(string.IsNullOrWhiteSpace(root.CheckoutAttemptId));
        Assert.Equal(409, Assert.IsType<ObjectResult>(await functions.CreateCheckout(second)).StatusCode);
        Assert.Single(handler.Paths);
    }

    [Fact]
    public async Task CheckoutRecovery_RejectsAnAmbiguousNonceSearch()
    {
        const string attemptId = "0123456789abcdef0123456789abcdef";
        var first = Snapshot(id: PendingId, plan: "plus", amount: 3990m,
            reference: $"{AccountId}|plus|{attemptId}");
        var second = Snapshot(id: "pending456", plan: "plus", amount: 3990m,
            reference: $"{AccountId}|plus|{attemptId}");
        var search = JsonSerializer.Serialize(new
        {
            paging = new { total = 2 },
            results = new[]
            {
                JsonSerializer.Deserialize<JsonElement>(first),
                JsonSerializer.Deserialize<JsonElement>(second),
            },
        });
        using var handler = new RecordingHandler((_, _) => Task.FromResult(JsonResponse(search)));
        using var http = new HttpClient(handler);
        var service = new SubscriptionService(Config(), http);

        await Assert.ThrowsAsync<SubscriptionProviderException>(() =>
            service.FindPreapprovalIdForCheckoutAttemptAsync(AccountId, "plus", attemptId));

        Assert.Equal($"/preapproval/search?q={attemptId}&limit=100", Assert.Single(handler.Paths));
    }

    [Fact]
    public void Verify_IsRegisteredOnlyForPost()
    {
        var method = typeof(SubscriptionFunctions).GetMethod(nameof(SubscriptionFunctions.Verify))!;
        var trigger = method.GetParameters()[0].GetCustomAttribute<HttpTriggerAttribute>()!;
        Assert.Equal("post", Assert.Single(trigger.Methods!));
    }

    [Fact]
    public async Task Verify_WithoutStoredIdsDoesNotSearchOrAdoptLegacySubscriptions()
    {
        var root = Account();
        root.SubscriptionId = string.Empty;
        root.PendingSubscriptionId = string.Empty;
        root.PendingPlan = string.Empty;
        root.SubscriptionStatus = string.Empty;
        var req = Request("POST");
        var storage = Storage();
        storage.Setup(s => s.GetByIdAsync(AccountId)).ReturnsAsync(root);
        using var handler = new RecordingHandler((_, _) => throw new InvalidOperationException("Unexpected provider search"));
        using var http = new HttpClient(handler);
        var functions = new SubscriptionFunctions(new SubscriptionService(Config(), http), storage.Object, Config(), Authorized(req, root).Object);

        var response = ResultJson(await functions.Verify(req, AccountId));
        Assert.Equal("", response.GetProperty("status").GetString());
        Assert.False(response.GetProperty("updated").GetBoolean());
        Assert.Empty(handler.Paths);
    }

    [Fact]
    public async Task Verify_RecoversExactlyOneNonceBoundReservation()
    {
        const string attemptId = "0123456789abcdef0123456789abcdef";
        var root = Account();
        root.PendingPlan = string.Empty;
        root.PendingSubscriptionId = string.Empty;
        root.CheckoutAttemptId = attemptId;
        root.CheckoutPlan = "plus";
        var storage = Storage(out var table);
        storage.Setup(s => s.GetByIdAsync(AccountId)).ReturnsAsync(root);
        table.Setup(t => t.UpdateEntityAsync(It.IsAny<DealershipEntity>(), It.IsAny<ETag>(),
                It.IsAny<TableUpdateMode>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Mock.Of<Response>());
        var req = Request("POST");
        var recovered = Snapshot(id: PendingId, plan: "plus", amount: 3990m,
            reference: $"{AccountId}|plus|{attemptId}", version: 2);
        // Search is discovery only: Mercado Pago may serialize its summary
        // amount differently. The canonical GET below remains the sole source
        // used to validate the financial terms before applying the state.
        var search = JsonSerializer.Serialize(new
        {
            paging = new { total = 1 },
            results = new[]
            {
                new
                {
                    id = PendingId,
                    external_reference = $"{AccountId}|plus|{attemptId}",
                    auto_recurring = new { transaction_amount = "3990" },
                },
            },
        });
        using var handler = new RecordingHandler((request, _) =>
        {
            var path = request.RequestUri!.AbsolutePath;
            if (request.Method == HttpMethod.Get && path == "/preapproval/search")
                return Task.FromResult(JsonResponse(search));
            if (request.Method == HttpMethod.Get && path == $"/preapproval/{PendingId}")
                return Task.FromResult(JsonResponse(recovered));
            if (request.Method == HttpMethod.Put && path == $"/preapproval/{ActiveId}")
                return Task.FromResult(JsonResponse(JsonSerializer.Serialize(new { id = ActiveId, status = "canceled" })));
            throw new InvalidOperationException($"Unexpected provider request {request.Method} {path}");
        });
        using var http = new HttpClient(handler);
        var functions = new SubscriptionFunctions(new SubscriptionService(Config(), http), storage.Object, Config(), Authorized(req, root).Object);

        var response = ResultJson(await functions.Verify(req, AccountId));

        Assert.True(response.GetProperty("updated").GetBoolean());
        Assert.Equal("authorized", response.GetProperty("status").GetString());
        Assert.Equal(PendingId, root.SubscriptionId);
        Assert.Equal("plus", root.Plan);
        Assert.Empty(root.CheckoutAttemptId);
        Assert.Empty(root.SupersededSubscriptionId);
        Assert.Contains($"/preapproval/search?q={attemptId}&limit=100", handler.Paths);
        Assert.DoesNotContain(handler.Paths, path => path == "/preapproval");
    }

    [Fact]
    public async Task Verify_ReconcilesPendingBeforeActiveAndReturnsPersistedStatus()
    {
        var root = Account();
        var req = Request("POST");
        var storage = Storage();
        storage.SetupSequence(s => s.GetByIdAsync(AccountId))
            .ReturnsAsync(root)
            .ReturnsAsync(new DealershipEntity { RowKey = AccountId })
            .ReturnsAsync(root)
            .ReturnsAsync(new DealershipEntity { RowKey = AccountId })
            .ReturnsAsync(new DealershipEntity { RowKey = AccountId, SubscriptionStatus = "paused" });
        using var handler = new RecordingHandler((request, _) => Task.FromResult(JsonResponse(
            request.RequestUri!.AbsolutePath.EndsWith(PendingId, StringComparison.Ordinal)
                ? Snapshot(id: PendingId, plan: "plus", amount: 3990m)
                : Snapshot())));
        using var http = new HttpClient(handler);
        var functions = new SubscriptionFunctions(new SubscriptionService(Config(), http), storage.Object, Config(), Authorized(req, root).Object);

        var response = ResultJson(await functions.Verify(req, AccountId));
        Assert.Equal(new[] { $"/preapproval/{PendingId}", $"/preapproval/{ActiveId}" }, handler.Paths);
        Assert.Equal("paused", response.GetProperty("status").GetString());
        Assert.False(response.GetProperty("updated").GetBoolean());
    }

    [Fact]
    public async Task Verify_RejectsProviderReferenceToAnotherAccount()
    {
        var root = Account();
        var req = Request("POST");
        var storage = Storage();
        storage.Setup(s => s.GetByIdAsync(AccountId)).ReturnsAsync(root);
        using var handler = new RecordingHandler((_, _) => Task.FromResult(JsonResponse(
            Snapshot(id: PendingId, plan: "plus", amount: 3990m, reference: "other-account|plus"))));
        using var http = new HttpClient(handler);
        var functions = new SubscriptionFunctions(new SubscriptionService(Config(), http), storage.Object, Config(), Authorized(req, root).Object);

        Assert.Equal(502, Assert.IsType<ObjectResult>(await functions.Verify(req, AccountId)).StatusCode);
        storage.Verify(s => s.GetByIdAsync("other-account"), Times.Never);
    }

    [Fact]
    public async Task Info_UsesRootSubscriptionInsteadOfSelectedBranchAndKeepsAnUnchangedSnapshot()
    {
        var root = Account();
        root.SubscriptionProviderVersion = 1;
        var req = Request("GET");
        var branch = new DealershipEntity { RowKey = "branch-1", OwnerAccountId = AccountId, SubscriptionId = "untrusted-branch-id" };
        var storage = Storage();
        storage.Setup(s => s.GetByIdAsync(AccountId)).ReturnsAsync(root);
        using var handler = new RecordingHandler((request, _) => Task.FromResult(JsonResponse(
            request.RequestUri!.AbsolutePath == $"/preapproval/{ActiveId}" ? Snapshot() : "{\"results\":[]}")));
        using var http = new HttpClient(handler);
        var functions = new SubscriptionFunctions(new SubscriptionService(Config(), http), storage.Object, Config(), Authorized(req, branch).Object);

        var result = Assert.IsType<OkObjectResult>(await functions.GetInfo(req, branch.RowKey));
        var info = Assert.IsType<SubscriptionInfoDto>(result.Value);
        Assert.Equal("authorized", info.Status);
        Assert.Empty(info.Payments);
        Assert.Equal(new[] { $"/preapproval/{ActiveId}", $"/authorized_payments/search?preapproval_id={ActiveId}&limit=10" }, handler.Paths);
        Assert.Equal(PendingId, root.PendingSubscriptionId);
        Assert.Equal("no-store", req.HttpContext.Response.Headers["Cache-Control"].ToString());
    }

    [Fact]
    public async Task Info_ReconcilesLostCancellationWebhookIntoLocalEntitlement()
    {
        // The active subscription was canceled remotely, but its webhook was
        // lost. A later authenticated billing read must not keep reporting the
        // stale local "authorized" entitlement.
        var root = Account();
        root.SubscriptionProviderVersion = 1;
        var req = Request("GET");
        var storage = Storage(out var table);
        storage.Setup(s => s.GetByIdAsync(AccountId)).ReturnsAsync(root);
        table.Setup(t => t.UpdateEntityAsync(It.IsAny<DealershipEntity>(), It.IsAny<ETag>(),
                TableUpdateMode.Merge, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Mock.Of<Response>());
        using var handler = new RecordingHandler((request, _) => Task.FromResult(JsonResponse(
            request.RequestUri!.AbsolutePath == $"/preapproval/{ActiveId}"
                ? Snapshot(status: "canceled", version: 2)
                : "{\"results\":[]}")));
        using var http = new HttpClient(handler);
        var functions = new SubscriptionFunctions(new SubscriptionService(Config(), http), storage.Object, Config(), Authorized(req, root).Object);

        var result = Assert.IsType<OkObjectResult>(await functions.GetInfo(req, AccountId));
        var info = Assert.IsType<SubscriptionInfoDto>(result.Value);

        Assert.Equal("canceled", info.Status);
        Assert.Equal("canceled", root.SubscriptionStatus);
        Assert.Equal(2, root.SubscriptionProviderVersion);
        Assert.Equal(new[] { $"/preapproval/{ActiveId}", $"/authorized_payments/search?preapproval_id={ActiveId}&limit=10" }, handler.Paths);
        table.Verify(t => t.UpdateEntityAsync(
            It.Is<DealershipEntity>(account => account.RowKey == AccountId &&
                account.SubscriptionStatus == "canceled" && account.SubscriptionProviderVersion == 2),
            It.IsAny<ETag>(), TableUpdateMode.Merge, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Development")]
    public async Task Webhook_MissingSecretFailsClosedInEveryEnvironment(string environment)
    {
        var config = Config(environment, secret: null);
        using var handler = new RecordingHandler((_, _) => throw new InvalidOperationException("Unexpected HTTP"));
        using var http = new HttpClient(handler);
        var functions = new SubscriptionFunctions(new SubscriptionService(config, http), Storage().Object, config,
            new Mock<IRequestAuthorizer>(MockBehavior.Strict).Object);
        Assert.Equal(503, Assert.IsType<ObjectResult>(await functions.Webhook(SignedWebhook(ActiveId))).StatusCode);
        Assert.Empty(handler.Paths);
    }

    [Fact]
    public async Task Webhook_BodyResourceMismatchNeverFetchesProvider()
    {
        using var handler = new RecordingHandler((_, _) => throw new InvalidOperationException("Unexpected HTTP"));
        using var http = new HttpClient(handler);
        var functions = new SubscriptionFunctions(new SubscriptionService(Config(), http), Storage().Object, Config(),
            new Mock<IRequestAuthorizer>(MockBehavior.Strict).Object);
        var request = SignedWebhook(ActiveId, bodyId: PendingId);
        Assert.Equal(401, Assert.IsType<ObjectResult>(await functions.Webhook(request)).StatusCode);
        Assert.Empty(handler.Paths);
    }

    [Theory]
    [InlineData("subscription_preapproval", false)]
    [InlineData("preapproval", false)]
    [InlineData("preapproval", true)]
    public async Task Webhook_SupportsCurrentAndLegacyTypesButIgnoresObsoleteIds(string type, bool legacy)
    {
        var storage = Storage();
        storage.Setup(s => s.GetByIdAsync(AccountId)).ReturnsAsync(Account());
        using var handler = new RecordingHandler((_, _) => Task.FromResult(JsonResponse(Snapshot(id: "obsolete123"))));
        using var http = new HttpClient(handler);
        var functions = new SubscriptionFunctions(new SubscriptionService(Config(), http), storage.Object, Config(),
            new Mock<IRequestAuthorizer>(MockBehavior.Strict).Object);

        var result = ResultJson(await functions.Webhook(SignedWebhook("obsolete123", type, legacy: legacy)));
        Assert.False(result.GetProperty("updated").GetBoolean());
        Assert.Equal("/preapproval/obsolete123", Assert.Single(handler.Paths));
    }

    [Fact]
    public async Task AuthorizedPaymentWebhook_IsExplicitlyIgnoredAndNeverGrantsPlan()
    {
        using var handler = new RecordingHandler((_, _) => throw new InvalidOperationException("Unexpected preapproval lookup"));
        using var http = new HttpClient(handler);
        var storage = Storage();
        var functions = new SubscriptionFunctions(new SubscriptionService(Config(), http), storage.Object, Config(),
            new Mock<IRequestAuthorizer>(MockBehavior.Strict).Object);
        var result = ResultJson(await functions.Webhook(SignedWebhook("payment123", "subscription_authorized_payment")));
        Assert.True(result.GetProperty("ignored").GetBoolean());
        Assert.Empty(handler.Paths);
        storage.Verify(s => s.GetByIdAsync(It.IsAny<string>()), Times.Never);
    }

    [Theory]
    [InlineData(429)]
    [InlineData(500)]
    [InlineData(503)]
    public async Task Webhook_TransientProviderFailureReturns503ForRetry(int status)
    {
        using var handler = new RecordingHandler((_, _) => Task.FromResult(
            new HttpResponseMessage((HttpStatusCode)status) { Content = new StringContent("private-provider-detail") }));
        using var http = new HttpClient(handler);
        var req = SignedWebhook(ActiveId);
        var functions = new SubscriptionFunctions(new SubscriptionService(Config(), http), Storage().Object, Config(),
            new Mock<IRequestAuthorizer>(MockBehavior.Strict).Object);
        var result = Assert.IsType<ObjectResult>(await functions.Webhook(req));
        Assert.Equal(503, result.StatusCode);
        Assert.DoesNotContain("private-provider-detail", JsonSerializer.Serialize(result.Value));
        Assert.Equal("30", req.HttpContext.Response.Headers["Retry-After"].ToString());
    }

    [Fact]
    public async Task Webhook_RejectsCurrentIdWhoseProviderPlanDoesNotMatchStoredPlan()
    {
        var storage = Storage();
        storage.Setup(s => s.GetByIdAsync(AccountId)).ReturnsAsync(Account());
        using var handler = new RecordingHandler((_, _) => Task.FromResult(JsonResponse(Snapshot(plan: "plus", amount: 3990m))));
        using var http = new HttpClient(handler);
        var functions = new SubscriptionFunctions(new SubscriptionService(Config(), http), storage.Object, Config(),
            new Mock<IRequestAuthorizer>(MockBehavior.Strict).Object);
        Assert.Equal(502, Assert.IsType<ObjectResult>(await functions.Webhook(SignedWebhook(ActiveId))).StatusCode);
    }

    [Fact]
    public void Simulation_IsAbsentFromNonDebugCompilation()
    {
        var method = typeof(SubscriptionFunctions).GetMethod("Simulate");
#if DEBUG
        Assert.NotNull(method);
#else
        Assert.Null(method);
#endif
    }

#if DEBUG
    [Theory]
    [InlineData("Production", "true")]
    [InlineData("Development", "false")]
    [InlineData("Development", null)]
    public async Task Simulation_RequiresDevelopmentAndExplicitEnableFlag(string environment, string? enabled)
    {
        var config = Config(environment, developmentEndpoints: enabled);
        using var handler = new RecordingHandler((_, _) => throw new InvalidOperationException("No payment should be attempted"));
        using var http = new HttpClient(handler);
        var functions = new SubscriptionFunctions(new SubscriptionService(config, http), Storage().Object, config,
            new Mock<IRequestAuthorizer>(MockBehavior.Strict).Object);
        Assert.IsType<NotFoundResult>(await functions.Simulate(Request("POST")));
        Assert.Empty(handler.Paths);
    }

    [Fact]
    public async Task Simulation_UsesAuthorizerCsrfValidationBeforeMutation()
    {
        var config = Config("Development", developmentEndpoints: "true");
        var req = Request("POST", JsonSerializer.Serialize(new { dealershipId = AccountId, plan = "basic" }));
        var auth = new Mock<IRequestAuthorizer>(MockBehavior.Strict);
        auth.Setup(a => a.RequireUserAsync(req)).ThrowsAsync(new ApiException(403, "csrf_invalid", "La validación de la solicitud falló."));
        using var handler = new RecordingHandler((_, _) => throw new InvalidOperationException("No payment should be attempted"));
        using var http = new HttpClient(handler);
        var storage = Storage();
        var functions = new SubscriptionFunctions(new SubscriptionService(config, http), storage.Object, config, auth.Object);
        Assert.Equal(403, Assert.IsType<ObjectResult>(await functions.Simulate(req)).StatusCode);
        Assert.Empty(handler.Paths);
        storage.Verify(s => s.GetByIdAsync(It.IsAny<string>()), Times.Never);
    }
#endif

    private static DealershipEntity Account() => new()
    {
        RowKey = AccountId, LoginEmail = "owner@example.invalid", Email = "showroom@example.invalid",
        Plan = "basic", SubscriptionId = ActiveId, SubscriptionStatus = "authorized",
        PendingPlan = "plus", PendingSubscriptionId = PendingId,
    };

    private static Mock<DealershipStorageService> Storage() => Storage(out _);

    private static Mock<DealershipStorageService> Storage(out Mock<TableClient> table)
    {
        // Constructor initialization is intercepted too; TableClient never contacts a host.
        table = new Mock<TableClient>(MockBehavior.Strict);
        table.Setup(t => t.CreateIfNotExists(It.IsAny<CancellationToken>())).Returns(() => null!);
        var tables = new Mock<TableServiceClient>(MockBehavior.Strict);
        tables.Setup(t => t.GetTableClient("Dealerships")).Returns(table.Object);
        var storage = new Mock<DealershipStorageService>(MockBehavior.Strict, tables.Object);
        // These methods became virtual so the scheduled reconciler can be
        // isolated in its own tests. Subscription endpoint tests deliberately
        // retain their previous integration behavior by executing the real
        // ETag/state implementation against this synthetic table client.
        storage.Setup(s => s.ApplySubscriptionAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<long>()))
            .CallBase();
        storage.Setup(s => s.ClearSupersededSubscriptionAsync(It.IsAny<string>(), It.IsAny<string>()))
            .CallBase();
        return storage;
    }

    private static Mock<IRequestAuthorizer> Authorized(HttpRequest req, DealershipEntity dealership)
    {
        var auth = new Mock<IRequestAuthorizer>(MockBehavior.Strict);
        auth.Setup(a => a.RequireUserAsync(req)).ReturnsAsync(new SessionUser(AccountId, false));
        auth.Setup(a => a.RequireDealershipAsync(req, dealership.RowKey, false)).ReturnsAsync(dealership);
        return auth;
    }

    private static IConfiguration Config(
        string environment = "Production", string? frontend = null, bool sandbox = false,
        string? secret = SyntheticSecret, string? developmentEndpoints = null) =>
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["AZURE_FUNCTIONS_ENVIRONMENT"] = environment,
            ["FrontendUrl"] = frontend,
            ["MercadoPago:UseSandbox"] = sandbox.ToString(CultureInfo.InvariantCulture),
            ["MercadoPago:AccessToken"] = "synthetic-handler-only-not-a-provider-token",
            ["MercadoPago:WebhookSecret"] = secret,
            ["EnableDevelopmentEndpoints"] = developmentEndpoints,
        }).Build();

    private static HttpRequest Request(string method, string body = "{}")
    {
        var request = new DefaultHttpContext().Request;
        request.Method = method;
        request.ContentType = "application/json";
        request.Body = new MemoryStream(Encoding.UTF8.GetBytes(body));
        return request;
    }

    private static HttpRequest SignedWebhook(string signedId, string type = "subscription_preapproval", string? bodyId = null, bool legacy = false)
    {
        var ts = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture);
        const string requestId = "request-123";
        var body = legacy
            ? JsonSerializer.Serialize(new { topic = type, id = bodyId ?? signedId })
            : JsonSerializer.Serialize(new { type, data = new { id = bodyId ?? signedId } });
        var request = Request("POST", body);
        request.QueryString = new QueryString($"?data.id={Uri.EscapeDataString(signedId)}");
        request.Headers["x-request-id"] = requestId;
        var hash = Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(SyntheticSecret),
            Encoding.UTF8.GetBytes($"id:{signedId.ToLowerInvariant()};request-id:{requestId};ts:{ts};"))).ToLowerInvariant();
        request.Headers["x-signature"] = $"ts={ts},v1={hash}";
        return request;
    }

    private static JsonElement ResultJson(IActionResult result) =>
        JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(result).Value);

    private static string Snapshot(
        string id = ActiveId, string plan = "basic", decimal amount = 2590m, string currency = "UYU",
        int frequency = 1, string frequencyType = "months", string? reference = null, string status = "authorized",
        long version = 1) =>
        JsonSerializer.Serialize(new
        {
            id, status, version, external_reference = reference ?? $"{AccountId}|{plan}",
            auto_recurring = new { transaction_amount = amount, currency_id = currency, frequency, frequency_type = frequencyType },
        });

    private static string CheckoutResponseJson() => JsonSerializer.Serialize(new
    {
        id = PendingId, init_point = "https://checkout.example.invalid/live", sandbox_init_point = "https://checkout.example.invalid/sandbox",
    });

    private static HttpResponseMessage JsonResponse(string body) =>
        new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private sealed class RecordingHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> responder) : HttpMessageHandler
    {
        public List<string> Paths { get; } = new();
        public List<string> Bodies { get; } = new();
        public bool SawCancelableToken { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Paths.Add(request.RequestUri!.PathAndQuery);
            SawCancelableToken |= cancellationToken.CanBeCanceled;
            if (request.Content is not null) Bodies.Add(await request.Content.ReadAsStringAsync(cancellationToken));
            return await responder(request, cancellationToken);
        }
    }
}
