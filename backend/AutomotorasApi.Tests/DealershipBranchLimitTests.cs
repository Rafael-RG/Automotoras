using System.Linq.Expressions;
using AutomotorasApi.Models;
using AutomotorasApi.Services;
using Azure;
using Azure.Data.Tables;
using Azure.Data.Tables.Models;
using Moq;
using Xunit;

namespace AutomotorasApi.Tests;

public class DealershipBranchLimitTests
{
    [Fact]
    public async Task CreateBranch_ReservesTheLastSlotInTheRootEtagTransaction()
    {
        var root = new DealershipEntity
        {
            RowKey = "account-a",
            OwnerAccountId = "account-a",
            Plan = "plus",
            SubscriptionStatus = "authorized",
            ManagedDealershipCount = 9,
            ETag = new ETag("root-v1"),
        };
        var table = Table();
        var tables = new Mock<TableServiceClient>(MockBehavior.Strict);
        tables.Setup(t => t.GetTableClient("Dealerships")).Returns(table.Object);
        table.Setup(t => t.GetEntityAsync<DealershipEntity>("dealership", root.RowKey, null,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(Response.FromValue(root, Mock.Of<Response>()));
        table.Setup(t => t.QueryAsync<DealershipEntity>(
                It.IsAny<Expression<Func<DealershipEntity, bool>>>(), It.IsAny<int?>(),
                It.IsAny<IEnumerable<string>>(), It.IsAny<CancellationToken>()))
            .Returns(Pageable<DealershipEntity>());

        IReadOnlyList<TableTransactionAction>? transaction = null;
        table.Setup(t => t.SubmitTransactionAsync(It.IsAny<IEnumerable<TableTransactionAction>>(),
                It.IsAny<CancellationToken>()))
            .Callback<IEnumerable<TableTransactionAction>, CancellationToken>((actions, _) =>
                transaction = actions.ToList())
            .ReturnsAsync(Response.FromValue<IReadOnlyList<Response>>(Array.Empty<Response>(), Mock.Of<Response>()));

        var service = new DealershipStorageService(tables.Object);
        var branch = await service.CreateBranchAsync(root.RowKey, new CreateDealershipRequest(
            "Sucursal", "Calle 2", "Montevideo", "Uruguay", "099 000 000", "branch@example.invalid", 0, 0));

        Assert.Equal(root.RowKey, branch.OwnerAccountId);
        Assert.Equal(10, root.ManagedDealershipCount);
        var actions = Assert.IsAssignableFrom<IReadOnlyList<TableTransactionAction>>(transaction);
        Assert.Collection(actions,
            update =>
            {
                Assert.Equal(TableTransactionActionType.UpdateMerge, update.ActionType);
                Assert.Same(root, update.Entity);
                Assert.Equal(root.ETag, update.ETag);
            },
            add =>
            {
                Assert.Equal(TableTransactionActionType.Add, add.ActionType);
                Assert.Same(branch, add.Entity);
            });
    }

    [Fact]
    public async Task CreateBranch_RejectsWhenTheDurableCounterIsAtTheLimit()
    {
        var root = new DealershipEntity
        {
            RowKey = "account-a",
            OwnerAccountId = "account-a",
            Plan = "plus",
            SubscriptionStatus = "authorized",
            ManagedDealershipCount = 10,
        };
        var table = Table();
        var tables = new Mock<TableServiceClient>(MockBehavior.Strict);
        tables.Setup(t => t.GetTableClient("Dealerships")).Returns(table.Object);
        table.Setup(t => t.GetEntityAsync<DealershipEntity>("dealership", root.RowKey, null,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(Response.FromValue(root, Mock.Of<Response>()));
        table.Setup(t => t.QueryAsync<DealershipEntity>(
                It.IsAny<Expression<Func<DealershipEntity, bool>>>(), It.IsAny<int?>(),
                It.IsAny<IEnumerable<string>>(), It.IsAny<CancellationToken>()))
            .Returns(Pageable<DealershipEntity>());

        var service = new DealershipStorageService(tables.Object);

        var error = await Assert.ThrowsAsync<ApiException>(() => service.CreateBranchAsync(root.RowKey,
            new CreateDealershipRequest("Sucursal", "Calle 2", "Montevideo", "Uruguay", "099 000 000",
                "branch@example.invalid", 0, 0)));

        Assert.Equal(409, error.StatusCode);
        Assert.Equal("branch_limit_reached", error.Code);
        table.Verify(t => t.SubmitTransactionAsync(It.IsAny<IEnumerable<TableTransactionAction>>(),
            It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ApplySubscription_RejectsALegacyBasicPromotionWhenBranchesExist()
    {
        var root = new DealershipEntity
        {
            RowKey = "account-a",
            OwnerAccountId = "account-a",
            Plan = "plus",
            SubscriptionId = "plus-active",
            SubscriptionStatus = "authorized",
            SubscriptionProviderVersion = 1,
            PendingPlan = "basic",
            PendingSubscriptionId = "basic-pending",
            PendingSubscriptionProviderVersion = 1,
            ManagedDealershipCount = 2,
            ETag = new ETag("root-v1"),
        };
        var table = Table();
        var tables = new Mock<TableServiceClient>(MockBehavior.Strict);
        tables.Setup(t => t.GetTableClient("Dealerships")).Returns(table.Object);
        table.Setup(t => t.GetEntityAsync<DealershipEntity>("dealership", root.RowKey, null,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(Response.FromValue(root, Mock.Of<Response>()));
        var service = new DealershipStorageService(tables.Object);

        var error = await Assert.ThrowsAsync<ApiException>(() => service.ApplySubscriptionAsync(
            root.RowKey, "basic", "basic-pending", "authorized", providerVersion: 2));

        Assert.Equal(409, error.StatusCode);
        Assert.Equal("downgrade_branches_exist", error.Code);
        table.Verify(t => t.UpdateEntityAsync(It.IsAny<DealershipEntity>(), It.IsAny<ETag>(),
            TableUpdateMode.Merge, It.IsAny<CancellationToken>()), Times.Never);
    }

    private static Mock<TableClient> Table()
    {
        var table = new Mock<TableClient>(MockBehavior.Strict);
        table.Setup(t => t.CreateIfNotExists(It.IsAny<CancellationToken>()))
            .Returns(Response.FromValue(new TableItem("Dealerships"), Mock.Of<Response>()));
        return table;
    }

    private static AsyncPageable<T> Pageable<T>(params T[] values) where T : notnull =>
        AsyncPageable<T>.FromPages(new[] { Page<T>.FromValues(values, null, Mock.Of<Response>()) });
}
