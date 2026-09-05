using System.Text;
using AutomotorasApi.Functions;
using AutomotorasApi.Services;
using Azure;
using Azure.Data.Tables;
using Azure.Data.Tables.Models;
using Microsoft.AspNetCore.Http;
using Moq;
using Xunit;

namespace AutomotorasApi.Tests;

public class AdministrativeAuthorizationTests
{
    [Fact]
    public async Task GetAds_RequiresPlatformAdminBeforeReadingStorage()
    {
        var request = Request();
        var authorizer = DenyPlatformAdmin(request);
        var functions = new AdFunctions(AdService(), authorizer.Object);

        var error = await Assert.ThrowsAsync<ApiException>(() => functions.GetAds(request));

        Assert.Equal("platform_admin_required", error.Code);
        authorizer.Verify(a => a.RequirePlatformAdminAsync(request), Times.Once);
    }

    [Fact]
    public async Task CreateAd_RequiresPlatformAdminBeforeReadingTheRequestBody()
    {
        var request = Request("POST", "{not-json");
        var authorizer = DenyPlatformAdmin(request);
        var functions = new AdFunctions(AdService(), authorizer.Object);

        var error = await Assert.ThrowsAsync<ApiException>(() => functions.CreateAd(request));

        Assert.Equal("platform_admin_required", error.Code);
        authorizer.Verify(a => a.RequirePlatformAdminAsync(request), Times.Once);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task SeedEndpoints_RequirePlatformAdminBeforeDevelopmentOrStorageChecks(bool clear)
    {
        var request = Request("POST");
        var authorizer = DenyPlatformAdmin(request);
        var functions = CreateSeedFunctions(authorizer.Object);

        var error = await Assert.ThrowsAsync<ApiException>(() => clear
            ? functions.ClearData(request)
            : functions.SeedData(request));

        Assert.Equal("platform_admin_required", error.Code);
        authorizer.Verify(a => a.RequirePlatformAdminAsync(request), Times.Once);
    }

    private static Mock<IRequestAuthorizer> DenyPlatformAdmin(HttpRequest request)
    {
        var authorizer = new Mock<IRequestAuthorizer>(MockBehavior.Strict);
        authorizer.Setup(a => a.RequirePlatformAdminAsync(request)).ThrowsAsync(
            new ApiException(403, "platform_admin_required", "Se requiere un administrador de plataforma."));
        return authorizer;
    }

    private static AdStorageService AdService()
    {
        var tables = new Mock<TableServiceClient>(MockBehavior.Strict);
        var ads = Table("Ads");
        tables.Setup(t => t.GetTableClient("Ads")).Returns(ads.Object);
        return new AdStorageService(tables.Object);
    }

    private static SeedFunctions CreateSeedFunctions(IRequestAuthorizer authorizer)
    {
        var tables = new Mock<TableServiceClient>(MockBehavior.Strict);
        var vehicles = Table("Vehicles");
        var dealerships = Table("Dealerships");
        tables.Setup(t => t.GetTableClient("Vehicles")).Returns(vehicles.Object);
        tables.Setup(t => t.GetTableClient("Dealerships")).Returns(dealerships.Object);
        return new SeedFunctions(new VehicleStorageService(tables.Object),
            new DealershipStorageService(tables.Object), authorizer);
    }

    private static Mock<TableClient> Table(string name)
    {
        var table = new Mock<TableClient>(MockBehavior.Strict);
        table.Setup(t => t.CreateIfNotExists(It.IsAny<CancellationToken>()))
            .Returns(Response.FromValue(new TableItem(name), Mock.Of<Response>()));
        return table;
    }

    private static HttpRequest Request(string method = "GET", string body = "{}")
    {
        var request = new DefaultHttpContext().Request;
        request.Method = method;
        request.ContentType = "application/json";
        request.Body = new MemoryStream(Encoding.UTF8.GetBytes(body));
        return request;
    }
}
