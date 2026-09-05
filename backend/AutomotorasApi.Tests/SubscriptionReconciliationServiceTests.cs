using System.Linq.Expressions;
using System.Net;
using System.Text;
using System.Text.Json;
using AutomotorasApi.Models;
using AutomotorasApi.Services;
using Azure;
using Azure.Data.Tables;
using Azure.Data.Tables.Models;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace AutomotorasApi.Tests;

public class SubscriptionReconciliationServiceTests
{
    private const string AccountId = "account-1";
    private const string ActiveId = "active123";
    private const string SupersededId = "old123";

    [Fact]
    public async Task AuthorizedRootQuery_ExcludesBranchesIndexesInactiveAndUnsupportedPlans()
    {
        var root = Account();
        var branch = Account();
        branch.RowKey = "branch-1";
        branch.OwnerAccountId = AccountId;
        var inactive = Account();
        inactive.RowKey = "inactive-1";
        inactive.OwnerAccountId = inactive.RowKey;
        inactive.SubscriptionStatus = "canceled";
        var unsupported = Account();
        unsupported.RowKey = "unsupported-1";
        unsupported.OwnerAccountId = unsupported.RowKey;
        unsupported.Plan = "enterprise";
        var index = new DealershipEntity
        {
            RowKey = "email-index:example",
            IsLoginEmailIndex = true,
            SubscriptionId = ActiveId,
            SubscriptionStatus = "authorized",
            Plan = "basic",
        };

        var table = new Mock<TableClient>(MockBehavior.Strict);
        table.Setup(t => t.CreateIfNotExists(It.IsAny<CancellationToken>()))
            .Returns(Response.FromValue(new TableItem("Dealerships"), Mock.Of<Response>()));
        table.Setup(t => t.QueryAsync<DealershipEntity>(
                It.IsAny<Expression<Func<DealershipEntity, bool>>>(), It.IsAny<int?>(),
                It.IsAny<IEnumerable<string>>(), It.IsAny<CancellationToken>()))
            .Returns(Pageable(root, branch, inactive, unsupported, index));
        var tables = new Mock<TableServiceClient>(MockBehavior.Strict);
        tables.Setup(t => t.GetTableClient("Dealerships")).Returns(table.Object);

        var service = new DealershipStorageService(tables.Object);
        var candidates = (await service.GetAuthorizedRootSubscriptionsAsync()).ToList();

        Assert.Equal(new[] { AccountId }, candidates.Select(item => item.RowKey));
    }

    [Fact]
    public async Task Reconciliation_AppliesCanonicalCancellationAndRetriesSupersededCancellation()
    {
        var account = Account();
        account.SupersededSubscriptionId = SupersededId;
        var storage = Storage();
        storage.Setup(s => s.GetAuthorizedRootSubscriptionsAsync()).ReturnsAsync(new[] { account });
        storage.Setup(s => s.GetByIdAsync(AccountId)).ReturnsAsync(account);
        storage.Setup(s => s.ApplySubscriptionAsync(AccountId, "basic", ActiveId, "canceled", "", 2))
            .Callback(() =>
            {
                account.SubscriptionStatus = "canceled";
                account.SubscriptionProviderVersion = 2;
            })
            .ReturnsAsync(true);
        storage.Setup(s => s.ClearSupersededSubscriptionAsync(AccountId, SupersededId))
            .Callback(() => account.SupersededSubscriptionId = string.Empty)
            .ReturnsAsync(true);

        using var handler = new RecordingHandler((request, _) => request.Method.Method switch
        {
            "GET" => Task.FromResult(JsonResponse(Snapshot(status: "canceled", version: 2))),
            "PUT" => Task.FromResult(JsonResponse(JsonSerializer.Serialize(new { id = SupersededId, status = "canceled" }))),
            _ => throw new InvalidOperationException("Unexpected provider method."),
        });
        using var http = new HttpClient(handler);
        var reconciliation = new SubscriptionReconciliationService(
            new SubscriptionService(Config(), http), storage.Object,
            NullLogger<SubscriptionReconciliationService>.Instance);

        var result = await reconciliation.ReconcileAuthorizedSubscriptionsAsync();

        Assert.Equal(1, result.Examined);
        Assert.Equal(1, result.Applied);
        Assert.Equal(0, result.Rejected);
        Assert.Equal(1, result.SupersededCanceled);
        Assert.Equal("canceled", account.SubscriptionStatus);
        Assert.Empty(account.SupersededSubscriptionId);
        Assert.Equal(new[] { "/preapproval/active123", "/preapproval/old123" }, handler.Paths);
        storage.Verify(s => s.ApplySubscriptionAsync(AccountId, "basic", ActiveId, "canceled", "", 2), Times.Once);
        storage.Verify(s => s.ClearSupersededSubscriptionAsync(AccountId, SupersededId), Times.Once);
    }

    [Fact]
    public async Task Reconciliation_RejectsForeignCanonicalReferenceBeforeAnyLocalMutation()
    {
        var account = Account();
        var storage = Storage();
        storage.Setup(s => s.GetAuthorizedRootSubscriptionsAsync()).ReturnsAsync(new[] { account });
        storage.Setup(s => s.GetByIdAsync(AccountId)).ReturnsAsync(account);

        using var handler = new RecordingHandler((_, _) =>
            Task.FromResult(JsonResponse(Snapshot(reference: "other-2|basic", version: 2))));
        using var http = new HttpClient(handler);
        var reconciliation = new SubscriptionReconciliationService(
            new SubscriptionService(Config(), http), storage.Object,
            NullLogger<SubscriptionReconciliationService>.Instance);

        var result = await reconciliation.ReconcileAuthorizedSubscriptionsAsync();

        Assert.Equal(1, result.Examined);
        Assert.Equal(1, result.Rejected);
        Assert.Equal(0, result.Applied);
        storage.Verify(s => s.ApplySubscriptionAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<long>()), Times.Never);
        storage.Verify(s => s.ClearSupersededSubscriptionAsync(It.IsAny<string>(), It.IsAny<string>()), Times.Never);
        Assert.Equal(new[] { "/preapproval/active123" }, handler.Paths);
    }

    [Fact]
    public async Task Reconciliation_SkipsAnAccountThatStoppedBeingAuthorizedBeforeTheProviderRead()
    {
        var listed = Account();
        var current = Account();
        current.SubscriptionStatus = "canceled";
        var storage = Storage();
        storage.Setup(s => s.GetAuthorizedRootSubscriptionsAsync()).ReturnsAsync(new[] { listed });
        storage.Setup(s => s.GetByIdAsync(AccountId)).ReturnsAsync(current);

        using var handler = new RecordingHandler((_, _) =>
            throw new InvalidOperationException("No provider request is expected for a stale candidate."));
        using var http = new HttpClient(handler);
        var reconciliation = new SubscriptionReconciliationService(
            new SubscriptionService(Config(), http), storage.Object,
            NullLogger<SubscriptionReconciliationService>.Instance);

        var result = await reconciliation.ReconcileAuthorizedSubscriptionsAsync();

        Assert.Equal(1, result.Examined);
        Assert.Equal(1, result.Skipped);
        Assert.Equal(0, result.Applied);
        Assert.Equal(0, result.Rejected);
        Assert.Empty(handler.Paths);
    }

    private static DealershipEntity Account() => new()
    {
        RowKey = AccountId,
        OwnerAccountId = AccountId,
        Plan = "basic",
        SubscriptionId = ActiveId,
        SubscriptionStatus = "authorized",
        SubscriptionProviderVersion = 1,
    };

    private static Mock<DealershipStorageService> Storage()
    {
        var table = new Mock<TableClient>(MockBehavior.Strict);
        table.Setup(t => t.CreateIfNotExists(It.IsAny<CancellationToken>()))
            .Returns(Response.FromValue(new TableItem("Dealerships"), Mock.Of<Response>()));
        var tables = new Mock<TableServiceClient>(MockBehavior.Strict);
        tables.Setup(t => t.GetTableClient("Dealerships")).Returns(table.Object);
        return new Mock<DealershipStorageService>(MockBehavior.Strict, tables.Object);
    }

    private static IConfiguration Config() => new ConfigurationBuilder().AddInMemoryCollection(
        new Dictionary<string, string?>
        {
            ["MercadoPago:AccessToken"] = "synthetic-handler-only-not-a-provider-token",
        }).Build();

    private static string Snapshot(string? reference = null, string status = "authorized", long version = 1) =>
        JsonSerializer.Serialize(new
        {
            id = ActiveId,
            status,
            version,
            external_reference = reference ?? $"{AccountId}|basic",
            auto_recurring = new
            {
                transaction_amount = 2590m,
                currency_id = "UYU",
                frequency = 1,
                frequency_type = "months",
            },
        });

    private static HttpResponseMessage JsonResponse(string body) =>
        new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private static AsyncPageable<T> Pageable<T>(params T[] values) where T : notnull =>
        AsyncPageable<T>.FromPages(new[] { Page<T>.FromValues(values, null, Mock.Of<Response>()) });

    private sealed class RecordingHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> responder)
        : HttpMessageHandler
    {
        public List<string> Paths { get; } = new();

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Paths.Add(request.RequestUri!.PathAndQuery);
            return await responder(request, cancellationToken);
        }
    }
}
