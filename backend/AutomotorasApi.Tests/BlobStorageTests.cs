using AutomotorasApi.Models;
using AutomotorasApi.Services;
using Azure;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Moq;
using Xunit;

namespace AutomotorasApi.Tests;

public class BlobStorageTests
{
    private const string AzureEndpoint = "https://unitaccount.blob.core.windows.net/";
    private const string AzuriteEndpoint = "http://127.0.0.1:10000/devstoreaccount1";
    private const string FileName = "11111111111111111111111111111111.jpg";

    [Theory]
    [InlineData(AzureEndpoint, AzureEndpoint + "vehicle-images/car-a/image.jpg")]
    [InlineData(AzuriteEndpoint, AzuriteEndpoint + "/vehicle-images/car-a/image.jpg")]
    [InlineData("https://storage.test/proxy/account", "https://storage.test/proxy/account/vehicle-images/car-a/image.jpg")]
    public void Resolve_HandlesExactAzureAzuriteAndBasePaths(string endpoint, string url)
    {
        Assert.True(BlobStorageService.TryResolveBlobUrl(new Uri(endpoint), url, "vehicle-images", out var container, out var blob));
        Assert.Equal("vehicle-images", container);
        Assert.Equal("car-a/image.jpg", blob);
    }

    [Theory]
    [InlineData(AzureEndpoint, "https://foreign.blob.core.windows.net/vehicle-images/car-a/image.jpg")]
    [InlineData(AzureEndpoint, "http://unitaccount.blob.core.windows.net/vehicle-images/car-a/image.jpg")]
    [InlineData(AzureEndpoint, "https://unitaccount.blob.core.windows.net:8443/vehicle-images/car-a/image.jpg")]
    [InlineData(AzureEndpoint, AzureEndpoint + "vehicle-images/car-a/image.jpg?versionid=123")]
    [InlineData(AzureEndpoint, AzureEndpoint + "vehicle-images/car-a/image.jpg?sig=not-a-secret")]
    [InlineData(AzureEndpoint, AzureEndpoint + "vehicle-images/car-a/image.jpg#fragment")]
    [InlineData(AzureEndpoint, AzureEndpoint + "private-files/car-a/image.jpg")]
    [InlineData(AzureEndpoint, AzureEndpoint + "dealership-logos/car-a/image.jpg")]
    [InlineData(AzureEndpoint, AzureEndpoint + "vehicle-images/../vehicle-images/car-a/image.jpg")]
    [InlineData(AzureEndpoint, AzureEndpoint + "vehicle-images/%2e%2e/vehicle-images/car-a/image.jpg")]
    [InlineData(AzureEndpoint, AzureEndpoint + "vehicle-images/car-a/%252e%252e/image.jpg")]
    [InlineData(AzureEndpoint, "https://some-user@unitaccount.blob.core.windows.net/vehicle-images/car-a/image.jpg")]
    [InlineData(AzuriteEndpoint, "http://127.0.0.1:10000/otheraccount/vehicle-images/car-a/image.jpg")]
    [InlineData(AzuriteEndpoint, "http://127.0.0.1:10000/devstoreaccount10/vehicle-images/car-a/image.jpg")]
    [InlineData(AzuriteEndpoint, "http://localhost:10000/devstoreaccount1/vehicle-images/car-a/image.jpg")]
    [InlineData(AzuriteEndpoint, "http://127.0.0.1:10000/vehicle-images/car-a/image.jpg")]
    [InlineData(AzuriteEndpoint, AzuriteEndpoint + "/vehicle-images/car-a/image.jpg?comp=snapshot")]
    public async Task UnsafeUrls_AreRejectedWithoutObtainingAContainer(string endpoint, string url)
    {
        var client = new Mock<BlobServiceClient>(MockBehavior.Strict);
        client.SetupGet(c => c.Uri).Returns(new Uri(endpoint));
        Assert.False(await new BlobStorageService(client.Object).DeleteBlobByUrlAsync(url, "vehicle-images"));
        client.Verify(c => c.GetBlobContainerClient(It.IsAny<string>()), Times.Never);
    }

    [Theory]
    [InlineData(AzureEndpoint, AzureEndpoint + "vehicle-images/car-a/image.jpg")]
    [InlineData(AzuriteEndpoint, AzuriteEndpoint + "/vehicle-images/car-a/image.jpg")]
    public async Task Delete_UsesResolvedContainerAndBlobName(string endpoint, string url)
    {
        var fixture = new Fixture(endpoint);
        fixture.Container.Setup(c => c.GetBlobClient("car-a/image.jpg")).Returns(fixture.Blob.Object);
        fixture.Blob.Setup(b => b.DeleteIfExistsAsync(It.IsAny<DeleteSnapshotsOption>(), null,
                It.IsAny<CancellationToken>())).ReturnsAsync(Response.FromValue(true, Mock.Of<Response>()));

        Assert.True(await fixture.Service.DeleteBlobByUrlAsync(url, "vehicle-images"));
        fixture.Container.Verify(c => c.GetBlobClient("car-a/image.jpg"), Times.Once);
        fixture.Blob.Verify(b => b.DeleteIfExistsAsync(It.IsAny<DeleteSnapshotsOption>(), null,
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public void PersistedVehicleReference_IsRequiredEvenForLegacyTempUrls()
    {
        var fixture = new Fixture();
        var legacy = AzureEndpoint + "vehicle-images/temp/" + FileName;
        var vehicle = new VehicleEntity { RowKey = "car-a", DealershipId = "dealer-a", ImageUrl = legacy };
        Assert.True(fixture.Service.IsPersistedVehicleImageUrl(vehicle, legacy));
        Assert.False(fixture.Service.IsPersistedVehicleImageUrl(vehicle, AzureEndpoint + "vehicle-images/temp/other.jpg"));

        var foreign = AzureEndpoint + "vehicle-images/car-b/image.jpg";
        vehicle.ImageUrl = foreign;
        Assert.False(fixture.Service.IsPersistedVehicleImageUrl(vehicle, foreign));
        fixture.Client.Verify(c => c.GetBlobContainerClient(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public void PersistedForeignHostOrContainerStillCannotBeDeleted()
    {
        var fixture = new Fixture();
        foreach (var url in new[]
        {
            "https://foreign.test/vehicle-images/car-a/image.jpg",
            AzureEndpoint + "dealership-logos/car-a/image.jpg",
            AzureEndpoint + "ad-banners/car-a/image.jpg"
        })
        {
            var vehicle = new VehicleEntity { RowKey = "car-a", ImageUrl = url };
            Assert.False(fixture.Service.IsPersistedVehicleImageUrl(vehicle, url));
        }
    }

    [Theory]
    [InlineData(AzureEndpoint)]
    [InlineData(AzuriteEndpoint)]
    public async Task SubmittedImages_AcceptExistingOwnTemporaryBlob(string endpoint)
    {
        var fixture = new Fixture(endpoint);
        var blobName = "temp/dealer-a/" + FileName;
        fixture.Container.Setup(c => c.GetBlobClient(blobName)).Returns(fixture.Blob.Object);
        fixture.Blob.Setup(b => b.ExistsAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(Response.FromValue(true, Mock.Of<Response>()));

        await fixture.Service.ValidateVehicleImageUrlsAsync(new[] { endpoint.TrimEnd('/') + "/vehicle-images/" + blobName }, "dealer-a");
        fixture.Blob.Verify(b => b.ExistsAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Theory]
    [InlineData("temp/dealer-b/" + FileName)]
    [InlineData("temp/dealer-a-other/" + FileName)]
    [InlineData("temp/" + FileName)]
    [InlineData("car-b/" + FileName)]
    [InlineData("temp/dealer-a/not-generated.jpg")]
    public async Task SubmittedImages_RejectOtherTenantOrUnownedPaths(string name)
    {
        var fixture = new Fixture();
        await Assert.ThrowsAsync<ApiException>(() => fixture.Service.ValidateVehicleImageUrlsAsync(
            new[] { AzureEndpoint + "vehicle-images/" + name }, "dealer-a"));
        fixture.Client.Verify(c => c.GetBlobContainerClient(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task SubmittedImages_RejectNonexistentTemporaryBlob()
    {
        var fixture = new Fixture();
        var blobName = "temp/dealer-a/" + FileName;
        fixture.Container.Setup(c => c.GetBlobClient(blobName)).Returns(fixture.Blob.Object);
        fixture.Blob.Setup(b => b.ExistsAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(Response.FromValue(false, Mock.Of<Response>()));
        await Assert.ThrowsAsync<ApiException>(() => fixture.Service.ValidateVehicleImageUrlsAsync(
            new[] { AzureEndpoint + "vehicle-images/" + blobName }, "dealer-a"));
    }

    [Fact]
    public async Task SubmittedImages_PreserveOnlyExactExistingLegacyReferences()
    {
        var fixture = new Fixture();
        var url = "https://example.test/seed-placeholder.jpg";
        var vehicle = new VehicleEntity { RowKey = "car-a", DealershipId = "dealer-a", ImageUrl = url };
        await fixture.Service.ValidateVehicleImageUrlsAsync(new[] { url }, "dealer-a", vehicle);
        await Assert.ThrowsAsync<ApiException>(() => fixture.Service.ValidateVehicleImageUrlsAsync(
            new[] { "https://example.test/different.jpg" }, "dealer-a", vehicle));
        fixture.Client.Verify(c => c.GetBlobContainerClient(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task Delete_DoesNotSilentlySwallowStorageFailure()
    {
        var fixture = new Fixture();
        fixture.Container.Setup(c => c.GetBlobClient("car-a/image.jpg")).Returns(fixture.Blob.Object);
        fixture.Blob.Setup(b => b.DeleteIfExistsAsync(It.IsAny<DeleteSnapshotsOption>(), null, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new RequestFailedException(503, "storage unavailable"));
        await Assert.ThrowsAsync<RequestFailedException>(() => fixture.Service.DeleteBlobByUrlAsync(
            AzureEndpoint + "vehicle-images/car-a/image.jpg", "vehicle-images"));
    }

    private sealed class Fixture
    {
        public Mock<BlobServiceClient> Client { get; } = new(MockBehavior.Strict);
        public Mock<BlobContainerClient> Container { get; } = new(MockBehavior.Strict);
        public Mock<BlobClient> Blob { get; } = new(MockBehavior.Strict);
        public BlobStorageService Service { get; }

        public Fixture(string endpoint = AzureEndpoint)
        {
            Client.SetupGet(c => c.Uri).Returns(new Uri(endpoint));
            Client.Setup(c => c.GetBlobContainerClient("vehicle-images")).Returns(Container.Object);
            Service = new BlobStorageService(Client.Object);
        }
    }
}