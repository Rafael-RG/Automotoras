using System.Linq.Expressions;
using System.Text.Json;
using AutomotorasApi.Models;
using AutomotorasApi.Services;
using Azure;
using Azure.Data.Tables;
using Azure.Data.Tables.Models;
using Moq;
using Xunit;

namespace AutomotorasApi.Tests;

public class DealershipCredentialBoundaryTests
{
    [Fact]
    public async Task UpdateContactEmail_PreservesAnExplicitLoginEmail()
    {
        var fixture = new Fixture();
        var account = Account(loginEmail: "owner@example.invalid", contactEmail: "old-contact@example.invalid");
        fixture.Read(account);
        fixture.AllowUpdate(account);

        var updated = await fixture.Service.UpdateAsync(account.RowKey, Update(account.Email, "new-contact@example.invalid"));

        Assert.NotNull(updated);
        Assert.Equal("new-contact@example.invalid", updated!.Email);
        Assert.Equal("owner@example.invalid", updated.LoginEmail);
        fixture.Table.Verify(t => t.UpdateEntityAsync(account, account.ETag, TableUpdateMode.Merge,
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task UpdatingLegacyContactEmail_MaterializesTheOriginalLoginEmail()
    {
        var fixture = new Fixture();
        var account = Account(loginEmail: "", contactEmail: "legacy-login@example.invalid");
        fixture.Read(account);
        fixture.AllowUpdate(account);

        var updated = await fixture.Service.UpdateAsync(account.RowKey, Update(account.Email, "new-contact@example.invalid"));

        Assert.NotNull(updated);
        Assert.Equal("new-contact@example.invalid", updated!.Email);
        Assert.Equal("legacy-login@example.invalid", updated.LoginEmail);
    }

    [Fact]
    public async Task LoginLookup_UsesLoginEmailInsteadOfPublicContactAndPublicDtoOmitsIt()
    {
        var fixture = new Fixture();
        var account = Account(loginEmail: "owner@example.invalid", contactEmail: "sales@example.invalid");
        fixture.ReturnAll(account);

        var byContact = await fixture.Service.GetByLoginEmailAsync(account.Email);
        var byLogin = await fixture.Service.GetByLoginEmailAsync(account.LoginEmail);
        var publicJson = JsonSerializer.Serialize(DealershipStorageService.ToDto(account));

        Assert.Null(byContact);
        Assert.Same(account, byLogin);
        Assert.Contains(account.Email, publicJson, StringComparison.Ordinal);
        Assert.DoesNotContain(account.LoginEmail, publicJson, StringComparison.Ordinal);
        Assert.DoesNotContain("LoginEmail", publicJson, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Registration_AtomicallyReservesTheNormalizedLoginEmail()
    {
        var fixture = new Fixture();
        fixture.ReturnAll();
        IReadOnlyList<TableTransactionAction>? transaction = null;
        fixture.Table.Setup(t => t.SubmitTransactionAsync(It.IsAny<IEnumerable<TableTransactionAction>>(),
                It.IsAny<CancellationToken>()))
            .Callback<IEnumerable<TableTransactionAction>, CancellationToken>((actions, _) =>
                transaction = actions.ToList())
            .ReturnsAsync(Response.FromValue<IReadOnlyList<Response>>(Array.Empty<Response>(), Mock.Of<Response>()));

        var registered = await fixture.Service.RegisterWithCredentialsAsync(
            new RegisterRequest("Automotora", "OWNER@example.invalid"));

        Assert.False(registered.emailExists);
        var actions = Assert.IsAssignableFrom<IReadOnlyList<TableTransactionAction>>(transaction);
        Assert.Collection(actions,
            account =>
            {
                var entity = Assert.IsType<DealershipEntity>(account.Entity);
                Assert.Equal(TableTransactionActionType.Add, account.ActionType);
                Assert.False(entity.IsLoginEmailIndex);
                Assert.Equal("OWNER@example.invalid", entity.LoginEmail);
            },
            index =>
            {
                var entity = Assert.IsType<DealershipEntity>(index.Entity);
                Assert.Equal(TableTransactionActionType.Add, index.ActionType);
                Assert.True(entity.IsLoginEmailIndex);
                Assert.Equal(registered.entity.RowKey, entity.IndexedAccountId);
                Assert.StartsWith("email-index:", entity.RowKey, StringComparison.Ordinal);
            });
    }

    [Fact]
    public async Task ConcurrentRegistrationIndexConflict_IsReportedAsEmailAlreadyRegistered()
    {
        var fixture = new Fixture();
        fixture.ReturnAll();
        fixture.Table.Setup(t => t.SubmitTransactionAsync(It.IsAny<IEnumerable<TableTransactionAction>>(),
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new RequestFailedException(409, "Conflict", null, null));

        var registered = await fixture.Service.RegisterWithCredentialsAsync(
            new RegisterRequest("Automotora", "owner@example.invalid"));

        Assert.True(registered.emailExists);
        Assert.Null(registered.entity);
    }

    private static DealershipEntity Account(string loginEmail, string contactEmail) => new()
    {
        RowKey = "account-a",
        OwnerAccountId = "account-a",
        Name = "Automotora",
        Email = contactEmail,
        LoginEmail = loginEmail,
        ETag = new ETag("account-etag"),
    };

    private static UpdateDealershipRequest Update(string oldContact, string newContact) => new(
        "Automotora", "Calle 1", "Montevideo", "Uruguay", "099 123 456", newContact);

    private static AsyncPageable<T> Pageable<T>(params T[] values) where T : notnull =>
        AsyncPageable<T>.FromPages(new[] { Page<T>.FromValues(values, null, Mock.Of<Response>()) });

    private sealed class Fixture
    {
        public Mock<TableClient> Table { get; } = new(MockBehavior.Strict);
        public DealershipStorageService Service { get; }

        public Fixture()
        {
            Table.Setup(t => t.CreateIfNotExists(It.IsAny<CancellationToken>()))
                .Returns(Response.FromValue(new TableItem("Dealerships"), Mock.Of<Response>()));
            // Legacy-account tests deliberately exercise the scan fallback;
            // newly registered accounts have an atomic email-index row.
            Table.Setup(t => t.GetEntityAsync<DealershipEntity>("dealership",
                    It.Is<string>(key => key.StartsWith("email-index:", StringComparison.Ordinal)), null,
                    It.IsAny<CancellationToken>()))
                .ThrowsAsync(new RequestFailedException(404, "Not found", null, null));
            var tables = new Mock<TableServiceClient>(MockBehavior.Strict);
            tables.Setup(t => t.GetTableClient("Dealerships")).Returns(Table.Object);
            Service = new DealershipStorageService(tables.Object);
        }

        public void Read(DealershipEntity account) =>
            Table.Setup(t => t.GetEntityAsync<DealershipEntity>("dealership", account.RowKey, null,
                    It.IsAny<CancellationToken>()))
                .ReturnsAsync(Response.FromValue(account, Mock.Of<Response>()));

        public void AllowUpdate(DealershipEntity account) =>
            Table.Setup(t => t.UpdateEntityAsync(account, account.ETag, TableUpdateMode.Merge,
                    It.IsAny<CancellationToken>()))
                .ReturnsAsync(Mock.Of<Response>());

        public void ReturnAll(params DealershipEntity[] accounts) =>
            Table.Setup(t => t.QueryAsync<DealershipEntity>(
                    It.IsAny<Expression<Func<DealershipEntity, bool>>>(), It.IsAny<int?>(),
                    It.IsAny<IEnumerable<string>>(), It.IsAny<CancellationToken>()))
                .Returns(Pageable(accounts));
    }
}
