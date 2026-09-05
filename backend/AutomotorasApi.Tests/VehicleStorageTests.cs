using System.Linq.Expressions;
using System.Text;
using System.Text.Json;
using AutomotorasApi.Functions;
using AutomotorasApi.Models;
using AutomotorasApi.Services;
using Azure;
using Azure.Data.Tables;
using Azure.Data.Tables.Models;
using Azure.Storage.Blobs;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace AutomotorasApi.Tests;

public class VehicleStorageTests
{
    private const string Brand = "Ford";
    private const string Id = "vehicle-a";
    private const string Dealer = "dealer-a";

    [Fact]
    public async Task Update_PreservesPrivateFieldsWhenOmitted_AndKeepsImages()
    {
        var fixture = new Fixture();
        var original = Entity();
        original.Matricula = "ABC1234";
        original.Padron = "123456";
        original.ImageUrl = "https://example.test/seed.jpg";
        fixture.Read(original);
        fixture.AllowUpdate();

        var updated = await fixture.Service.UpdateAsync(Brand, Id,
            Request() with { Price = 19000, Matricula = null, Padron = null });

        Assert.NotNull(updated);
        Assert.Equal("ABC1234", updated.Matricula);
        Assert.Equal("123456", updated.Padron);
        Assert.Equal(original.ImageUrl, updated.ImageUrl);
        Assert.Equal(19000, updated.Price);
        fixture.Table.Verify(t => t.UpdateEntityAsync(It.IsAny<VehicleEntity>(), original.ETag,
            TableUpdateMode.Merge, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Update_EmptyPrivateFieldsExplicitlyClearValues()
    {
        var fixture = new Fixture();
        var original = Entity();
        original.Matricula = "ABC1234";
        original.Padron = "123456";
        fixture.Read(original);
        fixture.AllowUpdate();
        var updated = await fixture.Service.UpdateAsync(Brand, Id, Request() with { Matricula = "", Padron = "" });
        Assert.Equal("", updated!.Matricula);
        Assert.Equal("", updated.Padron);
    }

    [Fact]
    public async Task Update_RejectsBrandChangeWithoutWritingOrRekeying()
    {
        var fixture = new Fixture();
        var original = Entity();
        fixture.Read(original);
        var error = await Assert.ThrowsAsync<ApiException>(() =>
            fixture.Service.UpdateAsync(Brand, Id, Request() with { Brand = "Toyota" }));
        Assert.Contains("marca", error.Message);
        Assert.Equal(Brand, original.PartitionKey);
        Assert.Equal(Brand, original.Brand);
        fixture.VerifyNoUpdates();
    }

    [Fact]
    public async Task Update_StaleEtagFailsOnceInsteadOfRetryingAnObsoleteForm()
    {
        var fixture = new Fixture();
        fixture.Read(Entity());
        fixture.Table.Setup(t => t.UpdateEntityAsync(It.IsAny<VehicleEntity>(), It.IsAny<ETag>(),
            TableUpdateMode.Merge, It.IsAny<CancellationToken>())).ThrowsAsync(new RequestFailedException(412, "conflict"));

        await Assert.ThrowsAsync<ApiException>(() => fixture.Service.UpdateAsync(Brand, Id, Request()));
        fixture.VerifyReads(Times.Once());
        fixture.VerifyUpdates(Times.Once());
    }

    [Theory]
    [InlineData("view")]
    [InlineData("lead")]
    [InlineData("share")]
    public async Task IncrementEvent_RereadsAfter412_UsesFreshCounterAndEtag(string eventType)
    {
        var fixture = new Fixture();
        var first = Entity("first", counter: 1);
        var fresh = Entity("fresh", counter: 7);
        fixture.Table.SetupSequence(t => t.GetEntityAsync<VehicleEntity>(Brand, Id, null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Response.FromValue(first, Mock.Of<Response>()))
            .ReturnsAsync(Response.FromValue(fresh, Mock.Of<Response>()));
        fixture.Table.SetupSequence(t => t.UpdateEntityAsync(It.IsAny<VehicleEntity>(), It.IsAny<ETag>(),
            TableUpdateMode.Merge, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new RequestFailedException(412, "conflict"))
            .ReturnsAsync(Mock.Of<Response>());

        Assert.True(await fixture.Service.IncrementEventAsync(Brand, Id, eventType));
        Assert.Equal(8, eventType switch { "view" => fresh.ViewCount, "lead" => fresh.LeadCount, _ => fresh.ShareCount });
        fixture.Table.Verify(t => t.UpdateEntityAsync(fresh, new ETag("fresh"), TableUpdateMode.Merge,
            It.IsAny<CancellationToken>()), Times.Once);
        fixture.VerifyReads(Times.Exactly(2));
    }

    [Fact]
    public async Task IncrementEvent_StopsAfterBoundedConflicts()
    {
        var fixture = new Fixture();
        fixture.Table.Setup(t => t.GetEntityAsync<VehicleEntity>(Brand, Id, null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(() => Response.FromValue(Entity(), Mock.Of<Response>()));
        fixture.Table.Setup(t => t.UpdateEntityAsync(It.IsAny<VehicleEntity>(), It.IsAny<ETag>(),
            TableUpdateMode.Merge, It.IsAny<CancellationToken>())).ThrowsAsync(new RequestFailedException(412, "conflict"));

        await Assert.ThrowsAsync<ApiException>(() => fixture.Service.IncrementEventAsync(Brand, Id, "view"));
        fixture.VerifyReads(Times.Exactly(TableRetry.MaxAttempts));
        fixture.VerifyUpdates(Times.Exactly(TableRetry.MaxAttempts));
    }

    [Fact]
    public async Task AddImage_ConcurrentTenthImagePreventsAnEleventhOnRetry()
    {
        var fixture = new Fixture();
        var first = WithImages(9, "first");
        var fresh = WithImages(10, "fresh");
        fixture.Table.SetupSequence(t => t.GetEntityAsync<VehicleEntity>(Brand, Id, null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Response.FromValue(first, Mock.Of<Response>()))
            .ReturnsAsync(Response.FromValue(fresh, Mock.Of<Response>()));
        fixture.Table.Setup(t => t.UpdateEntityAsync(It.IsAny<VehicleEntity>(), It.IsAny<ETag>(),
            TableUpdateMode.Merge, It.IsAny<CancellationToken>())).ThrowsAsync(new RequestFailedException(412, "conflict"));

        await Assert.ThrowsAsync<ApiException>(() => fixture.Service.AddImageUrlAsync(
            Brand, Id, "https://images.test/new.jpg", Dealer));
        fixture.VerifyUpdates(Times.Once());
        Assert.Equal(10, VehicleStorageService.ParseImageUrls(fresh).Length);
    }

    [Fact]
    public async Task AddImage_RetryPreservesConcurrentlyAddedImages()
    {
        var fixture = new Fixture();
        var first = WithImages(1, "first");
        var fresh = WithImages(2, "fresh");
        fixture.Table.SetupSequence(t => t.GetEntityAsync<VehicleEntity>(Brand, Id, null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Response.FromValue(first, Mock.Of<Response>()))
            .ReturnsAsync(Response.FromValue(fresh, Mock.Of<Response>()));
        fixture.Table.SetupSequence(t => t.UpdateEntityAsync(It.IsAny<VehicleEntity>(), It.IsAny<ETag>(),
            TableUpdateMode.Merge, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new RequestFailedException(412, "conflict")).ReturnsAsync(Mock.Of<Response>());

        Assert.True(await fixture.Service.AddImageUrlAsync(Brand, Id, "https://images.test/new.jpg", Dealer));
        Assert.Equal(new[] { "https://images.test/0.jpg", "https://images.test/1.jpg", "https://images.test/new.jpg" },
            VehicleStorageService.ParseImageUrls(fresh));
    }

    [Fact]
    public async Task RemoveImage_UnassociatedUrlDoesNotWrite()
    {
        var fixture = new Fixture();
        fixture.Read(WithImages(1));
        Assert.False(await fixture.Service.RemoveImageUrlAsync(Brand, Id, "https://images.test/foreign.jpg", Dealer));
        fixture.VerifyNoUpdates();
    }

    [Fact]
    public async Task RemoveImage_RetryPreservesConcurrentAddition()
    {
        var fixture = new Fixture();
        var fresh = WithImages(2, "fresh");
        fixture.Table.SetupSequence(t => t.GetEntityAsync<VehicleEntity>(Brand, Id, null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Response.FromValue(WithImages(1, "first"), Mock.Of<Response>()))
            .ReturnsAsync(Response.FromValue(fresh, Mock.Of<Response>()));
        fixture.Table.SetupSequence(t => t.UpdateEntityAsync(It.IsAny<VehicleEntity>(), It.IsAny<ETag>(),
            TableUpdateMode.Merge, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new RequestFailedException(412, "conflict")).ReturnsAsync(Mock.Of<Response>());

        Assert.True(await fixture.Service.RemoveImageUrlAsync(Brand, Id, "https://images.test/0.jpg", Dealer));
        Assert.Equal(new[] { "https://images.test/1.jpg" }, VehicleStorageService.ParseImageUrls(fresh));
        Assert.Equal("https://images.test/1.jpg", fresh.ImageUrl);
    }

    [Fact]
    public async Task ImageMutation_RejectsVehicleMovedSinceAuthorization()
    {
        var fixture = new Fixture();
        var moved = WithImages(1);
        moved.DealershipId = "dealer-b";
        fixture.Read(moved);
        await Assert.ThrowsAsync<ApiException>(() =>
            fixture.Service.RemoveImageUrlAsync(Brand, Id, "https://images.test/0.jpg", Dealer));
        fixture.VerifyNoUpdates();
    }

    [Fact]
    public async Task Delete_UsesAuthorizedSnapshotEtag()
    {
        var fixture = new Fixture();
        var entity = Entity("authorized");
        fixture.Table.Setup(t => t.DeleteEntityAsync(Brand, Id, entity.ETag, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Mock.Of<Response>());
        Assert.True(await fixture.Service.DeleteAsync(entity));
        fixture.VerifyReads(Times.Never());
        fixture.Table.Verify(t => t.DeleteEntityAsync(Brand, Id, new ETag("authorized"), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task PrivateList_AuthorizesBeforeFilteredServerQuery_AndIncludesPrivateFields()
    {
        var fixture = new Fixture();
        var request = new DefaultHttpContext().Request;
        var authorized = false;
        var auth = new Mock<IRequestAuthorizer>(MockBehavior.Strict);
        auth.Setup(a => a.RequireDealershipAsync(request, Dealer, false))
            .Callback(() => authorized = true).ReturnsAsync(new DealershipEntity { RowKey = Dealer });
        var entity = Entity();
        entity.Matricula = "ABC1234";
        Expression<Func<VehicleEntity, bool>>? capturedFilter = null;
        fixture.Table.Setup(t => t.QueryAsync(It.IsAny<Expression<Func<VehicleEntity, bool>>>(),
                It.IsAny<int?>(), It.IsAny<IEnumerable<string>>(), It.IsAny<CancellationToken>()))
            .Callback<Expression<Func<VehicleEntity, bool>>, int?, IEnumerable<string>, CancellationToken>((filter, _, _, _) =>
            {
                Assert.True(authorized);
                capturedFilter = filter;
            })
            .Returns(AsyncPageable<VehicleEntity>.FromPages(new[]
            {
                Page<VehicleEntity>.FromValues(new[] { entity }, null, Mock.Of<Response>())
            }));

        var result = await fixture.Functions(auth.Object).GetDealershipVehicles(request, Dealer);
        var dto = Assert.Single(Assert.IsAssignableFrom<IEnumerable<VehicleDealershipDto>>(Assert.IsType<OkObjectResult>(result).Value));
        Assert.Equal("ABC1234", dto.Matricula);
        Assert.NotNull(capturedFilter);
        var filter = capturedFilter.Compile();
        Assert.True(filter(entity));
        Assert.False(filter(new VehicleEntity { DealershipId = "dealer-b" }));
    }

    [Fact]
    public async Task PrivateList_DeniedBeforeAnyVehicleQuery()
    {
        var fixture = new Fixture();
        var request = new DefaultHttpContext().Request;
        var auth = new Mock<IRequestAuthorizer>(MockBehavior.Strict);
        auth.Setup(a => a.RequireDealershipAsync(request, "dealer-b", false))
            .ThrowsAsync(new ApiException(403, "forbidden", "Sin permiso."));
        await Assert.ThrowsAsync<ApiException>(() => fixture.Functions(auth.Object).GetDealershipVehicles(request, "dealer-b"));
        fixture.Table.VerifyNoOtherCalls();
    }

    [Theory]
    [InlineData(403)]
    [InlineData(404)]
    public async Task Create_CannotAssignForeignOrMissingDealership(int status)
    {
        var fixture = new Fixture();
        var request = JsonRequest("POST", Request() with { DealershipId = "dealer-b" });
        var auth = AuthorizedUser(request);
        auth.Setup(a => a.RequireDealershipAsync(request, "dealer-b", true))
            .ThrowsAsync(new ApiException(status, "invalid_dealership", "Automotora no disponible."));
        await Assert.ThrowsAsync<ApiException>(() => fixture.Functions(auth.Object).CreateVehicle(request));
        fixture.Table.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task Update_AuthorizesBothOriginalAndTargetDealership()
    {
        var fixture = new Fixture();
        fixture.Read(Entity());
        var request = JsonRequest("PUT", Request() with { DealershipId = "dealer-b" });
        var auth = AuthorizedUser(request);
        auth.Setup(a => a.RequireDealershipAsync(request, Dealer, true)).ReturnsAsync(new DealershipEntity { RowKey = Dealer });
        auth.Setup(a => a.RequireDealershipAsync(request, "dealer-b", true))
            .ThrowsAsync(new ApiException(403, "forbidden", "Sin permiso."));

        await Assert.ThrowsAsync<ApiException>(() => fixture.Functions(auth.Object).UpdateVehicle(request, Brand, Id));
        auth.Verify(a => a.RequireDealershipAsync(request, Dealer, true), Times.Once);
        auth.Verify(a => a.RequireDealershipAsync(request, "dealer-b", true), Times.Once);
        fixture.VerifyNoUpdates();
    }

    [Fact]
    public async Task Delete_PausedPlanDoesNotChangeTableOrBlobs()
    {
        var fixture = new Fixture();
        fixture.Read(Entity());
        var request = new DefaultHttpContext().Request;
        request.Method = "DELETE";
        var auth = AuthorizedUser(request);
        auth.Setup(a => a.RequireDealershipAsync(request, Dealer, true))
            .ThrowsAsync(new ApiException(403, "inactive_plan", "Se requiere un plan activo."));
        await Assert.ThrowsAsync<ApiException>(() => fixture.Functions(auth.Object).DeleteVehicle(request, Brand, Id));
        fixture.Table.Verify(t => t.DeleteEntityAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<ETag>(),
            It.IsAny<CancellationToken>()), Times.Never);
        fixture.BlobClient.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task PublicRead_DoesNotAuthenticateOrSerializePrivateIdentifiers()
    {
        var fixture = new Fixture();
        var entity = Entity();
        entity.Matricula = "PRIVATE-PLATE";
        entity.Padron = "PRIVATE-REGISTRY";
        fixture.Read(entity);
        var auth = new Mock<IRequestAuthorizer>(MockBehavior.Strict);
        var result = await fixture.Functions(auth.Object).GetVehicleById(new DefaultHttpContext().Request, Brand, Id);
        var dto = Assert.IsType<VehicleDto>(Assert.IsType<OkObjectResult>(result).Value);
        var json = JsonSerializer.Serialize(dto);
        Assert.DoesNotContain("Matricula", json);
        Assert.DoesNotContain("Padron", json);
        Assert.DoesNotContain("PRIVATE", json);
        auth.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task Tracking_Returns204InsteadOfEmpty200()
    {
        var fixture = new Fixture();
        fixture.Read(Entity());
        fixture.AllowUpdate();
        var request = JsonRequest("POST", new TrackEventRequest("view"));
        var authorizer = new Mock<IRequestAuthorizer>(MockBehavior.Strict);
        authorizer.Setup(a => a.RequireTrustedWriteAsync(request)).Returns(Task.CompletedTask);
        var result = await fixture.Functions(authorizer.Object)
            .TrackVehicleEvent(request, Brand, Id);
        Assert.IsType<NoContentResult>(result);
        authorizer.Verify(a => a.RequireTrustedWriteAsync(request), Times.Once);
    }

    [Theory]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    [InlineData(-1d)]
    [InlineData(1_000_000_001d)]
    public void Validation_RejectsInvalidPrices(double price) =>
        Assert.Throws<ApiException>(() => VehicleStorageService.ValidateRequest(Request() with { Price = price }));

    [Theory]
    [InlineData("")]
    [InlineData("a/b")]
    [InlineData("a\\b")]
    [InlineData("a?b")]
    [InlineData("a#b")]
    [InlineData("a\u007fb")]
    public void Validation_RejectsInvalidTableKeys(string key) =>
        Assert.Throws<ApiException>(() => VehicleStorageService.ValidateKey(key, "Identificador"));

    [Fact]
    public void Validation_RejectsInvalidRangesLengthsAndTooManyImages()
    {
        var invalidRequests = new[]
        {
            Request() with { Mileage = -1 }, Request() with { Year = 1800 },
            Request() with { Doors = 7 }, Request() with { Model = "" },
            Request() with { Description = new string('x', 10_001) },
            Request() with { Brand = new string('x', 81) },
            Request() with { ImageUrls = Enumerable.Range(0, 11).Select(i => $"https://images.test/{i}.jpg").ToArray() }
        };
        foreach (var invalid in invalidRequests)
            Assert.Throws<ApiException>(() => VehicleStorageService.ValidateRequest(invalid));
    }

    [Fact]
    public async Task TrustedSeedCreation_CanStillUseExternalPlaceholder()
    {
        var fixture = new Fixture();
        fixture.Table.Setup(t => t.AddEntityAsync(It.IsAny<VehicleEntity>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Mock.Of<Response>());
        var entity = await fixture.Service.CreateAsync(Request() with { ImageUrl = "https://example.test/placeholder.jpg" });
        Assert.Equal("https://example.test/placeholder.jpg", entity.ImageUrl);
    }

    private static Mock<IRequestAuthorizer> AuthorizedUser(HttpRequest request)
    {
        var auth = new Mock<IRequestAuthorizer>(MockBehavior.Strict);
        auth.Setup(a => a.RequireUserAsync(request)).ReturnsAsync(new SessionUser("account-a", false));
        return auth;
    }

    private static HttpRequest JsonRequest<T>(string method, T body)
    {
        var request = new DefaultHttpContext().Request;
        request.Method = method;
        request.ContentType = "application/json";
        request.Body = new MemoryStream(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(body)));
        return request;
    }

    private static CreateVehicleRequest Request() => new(Brand, "Focus", 2022, 20000, 25000,
        "Manual", "Nafta", "Sedán", Dealer, "Descripción de prueba");

    private static VehicleEntity Entity(string etag = "original", int counter = 0) => new()
    {
        PartitionKey = Brand, RowKey = Id, Brand = Brand, Model = "Focus", DealershipId = Dealer,
        ETag = new ETag(etag), Year = 2022, ViewCount = counter, LeadCount = counter, ShareCount = counter
    };

    private static VehicleEntity WithImages(int count, string etag = "original")
    {
        var entity = Entity(etag);
        entity.ImageUrlsJson = string.Join('|', Enumerable.Range(0, count).Select(i => $"https://images.test/{i}.jpg"));
        entity.ImageUrl = count > 0 ? "https://images.test/0.jpg" : "";
        return entity;
    }

    private sealed class Fixture
    {
        public Mock<TableClient> Table { get; } = new(MockBehavior.Strict);
        public Mock<BlobServiceClient> BlobClient { get; } = new(MockBehavior.Strict);
        public VehicleStorageService Service { get; }

        public Fixture()
        {
            Table.Setup(t => t.CreateIfNotExists(It.IsAny<CancellationToken>()))
                .Returns(Response.FromValue(new TableItem("Vehicles"), Mock.Of<Response>()));
            var tables = new Mock<TableServiceClient>(MockBehavior.Strict);
            tables.Setup(t => t.GetTableClient("Vehicles")).Returns(Table.Object);
            Service = new VehicleStorageService(tables.Object);
            Table.Invocations.Clear();
        }

        public VehicleFunctions Functions(IRequestAuthorizer auth) =>
            new(Service, new BlobStorageService(BlobClient.Object), auth, new ImageValidationService());

        public void Read(VehicleEntity entity) =>
            Table.Setup(t => t.GetEntityAsync<VehicleEntity>(Brand, Id, null, It.IsAny<CancellationToken>()))
                .ReturnsAsync(Response.FromValue(entity, Mock.Of<Response>()));

        public void AllowUpdate() =>
            Table.Setup(t => t.UpdateEntityAsync(It.IsAny<VehicleEntity>(), It.IsAny<ETag>(),
                TableUpdateMode.Merge, It.IsAny<CancellationToken>())).ReturnsAsync(Mock.Of<Response>());

        public void VerifyNoUpdates() => VerifyUpdates(Times.Never());
        public void VerifyUpdates(Times times) => Table.Verify(t => t.UpdateEntityAsync(It.IsAny<VehicleEntity>(),
            It.IsAny<ETag>(), TableUpdateMode.Merge, It.IsAny<CancellationToken>()), times);
        public void VerifyReads(Times times) => Table.Verify(t => t.GetEntityAsync<VehicleEntity>(Brand, Id,
            null, It.IsAny<CancellationToken>()), times);
    }
}
