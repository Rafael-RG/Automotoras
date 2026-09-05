using System.Buffers.Binary;
using System.Text;
using AutomotorasApi.Functions;
using AutomotorasApi.Models;
using AutomotorasApi.Services;
using Azure;
using Azure.Data.Tables;
using Azure.Data.Tables.Models;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace AutomotorasApi.Tests;

public class ImageValidationTests
{
    private readonly ImageValidationService _validation = new();
    // A one-pixel PNG fixture, not a network asset.
    private static byte[] Png() => Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMZsAAAAASUVORK5CYII=");

    [Fact]
    public void Png_ValidatesBytesAndDimensions()
    {
        var image = ImageValidationService.Validate(Png(), "image/png");
        Assert.Equal("image/png", image.ContentType);
        Assert.Equal(1, image.Width);
        Assert.Equal(1, image.Height);
    }

    [Theory]
    [InlineData("image/jpeg")]
    [InlineData("image/png")]
    [InlineData("image/webp")]
    [InlineData("image/svg+xml")]
    public void HtmlRenamedAsImageIsRejected(string mime) =>
        Assert.Throws<ApiException>(() => ImageValidationService.Validate(Encoding.UTF8.GetBytes("<html>not an image</html>"), mime));

    [Theory]
    [InlineData("image/jpeg")]
    [InlineData("image/webp")]
    public void MimeMustMatchBytes(string mime) =>
        Assert.Throws<ApiException>(() => ImageValidationService.Validate(Png(), mime));

    [Fact]
    public void RejectsEmptyAndOversizedImages()
    {
        Assert.Throws<ApiException>(() => ImageValidationService.Validate(Array.Empty<byte>(), "image/png"));
        Assert.Throws<ApiException>(() => ImageValidationService.Validate(new byte[ImageValidationService.MaxFileSize + 1], "image/png"));
    }

    [Fact]
    public void Png_RejectsTruncationAndExcessiveDimensions()
    {
        var png = Png();
        Assert.Throws<ApiException>(() => ImageValidationService.Validate(png[..^4], "image/png"));
        BinaryPrimitives.WriteUInt32BigEndian(png.AsSpan(16, 4), 8193);
        Assert.Throws<ApiException>(() => ImageValidationService.Validate(png, "image/png"));
        BinaryPrimitives.WriteUInt32BigEndian(png.AsSpan(16, 4), 8192);
        BinaryPrimitives.WriteUInt32BigEndian(png.AsSpan(20, 4), 8192);
        Assert.Throws<ApiException>(() => ImageValidationService.Validate(png, "image/png"));
    }

    [Fact]
    public void Jpeg_ReadsFrameDimensions_RejectsMissingScanAndEnd()
    {
        // Header/scan fixture for the deliberately non-decoding validator.
        byte[] jpeg =
        [
            0xff, 0xd8,
            0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x02, 0x00, 0x03, 0x01, 0x01, 0x11, 0x00,
            0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x01,
            0xff, 0xd9
        ];
        var image = ImageValidationService.Validate(jpeg, "image/jpeg");
        Assert.Equal(3, image.Width);
        Assert.Equal(2, image.Height);
        Assert.Throws<ApiException>(() => ImageValidationService.Validate(jpeg[..^2], "image/jpeg"));
        jpeg[16] = 0xfe; // Replace SOS with a comment marker: no image scan remains.
        Assert.Throws<ApiException>(() => ImageValidationService.Validate(jpeg, "image/jpeg"));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void Webp_ValidatesLossyAndLosslessDimensions(bool lossless)
    {
        var bytes = Webp(lossless);
        var image = ImageValidationService.Validate(bytes, "image/webp");
        Assert.Equal(3, image.Width);
        Assert.Equal(2, image.Height);
        Assert.Throws<ApiException>(() => ImageValidationService.Validate(bytes[..^1], "image/webp"));
    }

    [Fact]
    public async Task Read_EnforcesActualLengthEvenWithoutContentLength()
    {
        using var oversized = new MemoryStream(new byte[ImageValidationService.MaxFileSize + 100]);
        await Assert.ThrowsAsync<ApiException>(() => _validation.ReadAndValidateAsync(oversized, "image/png"));
        Assert.Equal(ImageValidationService.MaxFileSize + 1L, oversized.Position);
    }

    [Fact]
    public async Task TemporaryUpload_RequiresTenantBeforeFile()
    {
        var called = false;
        var request = MultipartRequest(Png());
        await Assert.ThrowsAsync<ApiException>(() => _validation.ReadTemporaryUploadAsync(request, _ =>
        {
            called = true;
            return Task.CompletedTask;
        }));
        Assert.False(called);
    }

    [Fact]
    public async Task TemporaryUpload_AuthorizesBeforeValidatingOrUploadingImage()
    {
        var request = MultipartRequest(Encoding.UTF8.GetBytes("invalid image"), "dealer-b");
        var denial = new ApiException(403, "forbidden", "Sin permiso.");
        var error = await Assert.ThrowsAsync<ApiException>(() => _validation.ReadTemporaryUploadAsync(request, dealer =>
        {
            Assert.Equal("dealer-b", dealer);
            return Task.FromException(denial);
        }));
        Assert.Same(denial, error);
    }

    [Fact]
    public async Task TemporaryUpload_AcceptsAuthorizedTenantAndImage()
    {
        var request = MultipartRequest(Png(), "dealer-a");
        var authorized = false;
        var upload = await _validation.ReadTemporaryUploadAsync(request, dealer =>
        {
            Assert.Equal("dealer-a", dealer);
            authorized = true;
            return Task.CompletedTask;
        });
        Assert.True(authorized);
        Assert.Equal("dealer-a", upload.DealershipId);
        Assert.Equal(1, upload.Image.Width);
    }

    [Fact]
    public async Task VehicleUpload_UnauthenticatedRequestDoesNotReadBodyOrQueryVehicle()
    {
        var fixture = new FunctionFixture();
        var request = new DefaultHttpContext().Request;
        request.Method = "POST";
        request.Body = new Mock<Stream>(MockBehavior.Strict).Object;
        fixture.Auth.Setup(a => a.RequireUserAsync(request))
            .ThrowsAsync(new ApiException(401, "unauthorized", "Iniciá sesión."));

        await Assert.ThrowsAsync<ApiException>(() => fixture.Functions.UploadVehicleImage(request, "Ford", "car-a"));
        fixture.Vehicles.VerifyNoOtherCalls();
        fixture.Blobs.VerifyNoOtherCalls();
    }

    [Theory]
    [InlineData(403)]
    [InlineData(404)]
    public async Task LogoUpload_RejectsMissingOrForeignDealershipBeforeBody(int status)
    {
        var fixture = new FunctionFixture();
        var request = new DefaultHttpContext().Request;
        request.Method = "POST";
        request.Body = new Mock<Stream>(MockBehavior.Strict).Object;
        fixture.Auth.Setup(a => a.RequireDealershipAsync(request, "dealer-b", true))
            .ThrowsAsync(new ApiException(status, "invalid_dealership", "Automotora no disponible."));

        await Assert.ThrowsAsync<ApiException>(() => fixture.Functions.UploadDealershipLogo(request, "dealer-b"));
        fixture.Dealerships.VerifyNoOtherCalls();
        fixture.Blobs.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task RemoveVehicleImage_UnassociatedUrlDoesNotTouchBlobsOrMetadata()
    {
        var fixture = new FunctionFixture();
        var request = new DefaultHttpContext().Request;
        request.Method = "DELETE";
        request.QueryString = new QueryString("?url=" + Uri.EscapeDataString("https://unitaccount.blob.core.windows.net/vehicle-images/car-b/image.jpg"));
        fixture.AuthorizeVehicle(request);
        fixture.Vehicles.Setup(t => t.GetEntityAsync<VehicleEntity>("Ford", "car-a", null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Response.FromValue(Vehicle(), Mock.Of<Response>()));

        await Assert.ThrowsAsync<ApiException>(() => fixture.Functions.RemoveVehicleImage(request, "Ford", "car-a"));
        fixture.Blobs.VerifyNoOtherCalls();
        fixture.Vehicles.Verify(t => t.UpdateEntityAsync(It.IsAny<VehicleEntity>(), It.IsAny<ETag>(),
            It.IsAny<TableUpdateMode>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task VehicleUpload_DeletesNewBlobWhenEntityDisappearsBeforeMetadataCommit()
    {
        var fixture = new FunctionFixture();
        var request = MultipartRequest(Png());
        fixture.AuthorizeVehicle(request);
        fixture.Vehicles.SetupSequence(t => t.GetEntityAsync<VehicleEntity>("Ford", "car-a", null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Response.FromValue(Vehicle(), Mock.Of<Response>()))
            .ThrowsAsync(new RequestFailedException(404, "missing"));
        fixture.AllowUpload("vehicle-images", "car-a/new.jpg");

        await Assert.ThrowsAsync<ApiException>(() => fixture.Functions.UploadVehicleImage(request, "Ford", "car-a"));
        fixture.VerifyBlobDeleted();
    }

    [Fact]
    public async Task VehicleUpload_DeletesNewBlobWhenConcurrentUploadFillsLastSlot()
    {
        var fixture = new FunctionFixture();
        var request = MultipartRequest(Png());
        fixture.AuthorizeVehicle(request);
        var full = Vehicle();
        full.ImageUrlsJson = string.Join('|', Enumerable.Range(0, 10).Select(i => $"https://images.test/{i}.jpg"));
        fixture.Vehicles.SetupSequence(t => t.GetEntityAsync<VehicleEntity>("Ford", "car-a", null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Response.FromValue(Vehicle(), Mock.Of<Response>()))
            .ReturnsAsync(Response.FromValue(full, Mock.Of<Response>()));
        fixture.AllowUpload("vehicle-images", "car-a/new.jpg");

        await Assert.ThrowsAsync<ApiException>(() => fixture.Functions.UploadVehicleImage(request, "Ford", "car-a"));
        fixture.VerifyBlobDeleted();
        fixture.Vehicles.Verify(t => t.UpdateEntityAsync(It.IsAny<VehicleEntity>(), It.IsAny<ETag>(),
            It.IsAny<TableUpdateMode>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task LogoUpload_DoesNotReportSuccessWhenMetadataUpdateReturnsFalse()
    {
        var fixture = new FunctionFixture();
        var request = MultipartRequest(Png());
        fixture.Auth.Setup(a => a.RequireDealershipAsync(request, "dealer-a", true))
            .ReturnsAsync(new DealershipEntity { RowKey = "dealer-a" });
        fixture.Dealerships.Setup(t => t.GetEntityAsync<DealershipEntity>("dealership", "dealer-a", null, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new RequestFailedException(404, "missing"));
        fixture.AllowUpload("dealership-logos", "dealer-a/new.png");

        await Assert.ThrowsAsync<ApiException>(() => fixture.Functions.UploadDealershipLogo(request, "dealer-a"));
        fixture.VerifyBlobDeleted();
    }

    [Fact]
    public async Task LogoUpload_CleansUpWhenMetadataEtagConflicts()
    {
        var fixture = new FunctionFixture();
        var request = MultipartRequest(Png());
        fixture.Auth.Setup(a => a.RequireDealershipAsync(request, "dealer-a", true))
            .ReturnsAsync(new DealershipEntity { RowKey = "dealer-a" });
        fixture.Dealerships.Setup(t => t.GetEntityAsync<DealershipEntity>("dealership", "dealer-a", null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Response.FromValue(new DealershipEntity { RowKey = "dealer-a", ETag = new ETag("original") }, Mock.Of<Response>()));
        fixture.Dealerships.Setup(t => t.UpdateEntityAsync(It.IsAny<DealershipEntity>(), It.IsAny<ETag>(),
            It.IsAny<TableUpdateMode>(), It.IsAny<CancellationToken>())).ThrowsAsync(new RequestFailedException(412, "conflict"));
        fixture.AllowUpload("dealership-logos", "dealer-a/new.png");

        await Assert.ThrowsAsync<ApiException>(() => fixture.Functions.UploadDealershipLogo(request, "dealer-a"));
        fixture.VerifyBlobDeleted();
    }

    [Fact]
    public async Task AdImage_RequiresPlatformAdminBeforeReadingUpload()
    {
        var fixture = new FunctionFixture();
        var request = new DefaultHttpContext().Request;
        request.Method = "POST";
        request.Body = new Mock<Stream>(MockBehavior.Strict).Object;
        fixture.Auth.Setup(a => a.RequirePlatformAdminAsync(request))
            .ThrowsAsync(new ApiException(403, "forbidden", "Se requiere administrador."));
        await Assert.ThrowsAsync<ApiException>(() => fixture.Functions.UploadAdImage(request, "ad-a"));
        fixture.Ads.VerifyNoOtherCalls();
        fixture.Blobs.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task VehicleUpload_SuccessPreservesUrlResponseAndDoesNotCleanup()
    {
        var fixture = new FunctionFixture();
        var request = MultipartRequest(Png());
        fixture.AuthorizeVehicle(request);
        fixture.Vehicles.Setup(t => t.GetEntityAsync<VehicleEntity>("Ford", "car-a", null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(() => Response.FromValue(Vehicle(), Mock.Of<Response>()));
        fixture.Vehicles.Setup(t => t.UpdateEntityAsync(It.IsAny<VehicleEntity>(), It.IsAny<ETag>(),
            TableUpdateMode.Merge, It.IsAny<CancellationToken>())).ReturnsAsync(Mock.Of<Response>());
        fixture.AllowUpload("vehicle-images", "car-a/new.png");

        var result = Assert.IsType<OkObjectResult>(await fixture.Functions.UploadVehicleImage(request, "Ford", "car-a"));
        Assert.NotNull(result.Value?.GetType().GetProperty("url")?.GetValue(result.Value));
        fixture.Blob.Verify(b => b.DeleteIfExistsAsync(It.IsAny<DeleteSnapshotsOption>(),
            It.IsAny<BlobRequestConditions>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    private static byte[] Webp(bool lossless)
    {
        byte[] payload = lossless ? [0x2f, 0x02, 0x40, 0x00, 0x00, 0x01] :
            [0x10, 0x00, 0x00, 0x9d, 0x01, 0x2a, 0x03, 0x00, 0x02, 0x00, 0x01, 0x00];
        var bytes = new byte[20 + payload.Length];
        "RIFF"u8.CopyTo(bytes);
        BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(4, 4), (uint)bytes.Length - 8);
        "WEBP"u8.CopyTo(bytes.AsSpan(8));
        Encoding.ASCII.GetBytes(lossless ? "VP8L" : "VP8 ").CopyTo(bytes, 12);
        BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(16, 4), (uint)payload.Length);
        payload.CopyTo(bytes, 20);
        return bytes;
    }

    private static HttpRequest MultipartRequest(byte[] image, string? dealershipId = null)
    {
        const string boundary = "unit-test-boundary";
        var request = new DefaultHttpContext().Request;
        request.Method = "POST";
        request.ContentType = $"multipart/form-data; boundary={boundary}";
        var stream = new MemoryStream();
        if (dealershipId is not null)
            stream.Write(Encoding.UTF8.GetBytes($"--{boundary}\r\nContent-Disposition: form-data; name=\"dealershipId\"\r\n\r\n{dealershipId}\r\n"));
        stream.Write(Encoding.UTF8.GetBytes($"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"image.png\"\r\nContent-Type: image/png\r\n\r\n"));
        stream.Write(image);
        stream.Write(Encoding.UTF8.GetBytes($"\r\n--{boundary}--\r\n"));
        stream.Position = 0;
        request.Body = stream;
        return request;
    }

    private static VehicleEntity Vehicle() => new()
    {
        PartitionKey = "Ford", Brand = "Ford", RowKey = "car-a", DealershipId = "dealer-a", ETag = new ETag("original")
    };

    private sealed class FunctionFixture
    {
        public Mock<IRequestAuthorizer> Auth { get; } = new(MockBehavior.Strict);
        public Mock<TableClient> Vehicles { get; } = Table("Vehicles");
        public Mock<TableClient> Dealerships { get; } = Table("Dealerships");
        public Mock<TableClient> Ads { get; } = Table("Ads");
        public Mock<BlobServiceClient> Blobs { get; } = new(MockBehavior.Strict);
        public Mock<BlobContainerClient> Container { get; } = new(MockBehavior.Strict);
        public Mock<BlobClient> Blob { get; } = new(MockBehavior.Strict);
        public ImageFunctions Functions { get; }

        public FunctionFixture()
        {
            var tables = new Mock<TableServiceClient>(MockBehavior.Strict);
            tables.Setup(t => t.GetTableClient("Vehicles")).Returns(Vehicles.Object);
            tables.Setup(t => t.GetTableClient("Dealerships")).Returns(Dealerships.Object);
            tables.Setup(t => t.GetTableClient("Ads")).Returns(Ads.Object);
            Functions = new ImageFunctions(new BlobStorageService(Blobs.Object),
                new VehicleStorageService(tables.Object), new DealershipStorageService(tables.Object),
                new AdStorageService(tables.Object), Auth.Object, new ImageValidationService());
            Vehicles.Invocations.Clear();
            Dealerships.Invocations.Clear();
            Ads.Invocations.Clear();
        }

        public void AuthorizeVehicle(HttpRequest request)
        {
            Auth.Setup(a => a.RequireUserAsync(request)).ReturnsAsync(new SessionUser("account-a", false));
            Auth.Setup(a => a.RequireDealershipAsync(request, "dealer-a", true))
                .ReturnsAsync(new DealershipEntity { RowKey = "dealer-a" });
        }

        public void AllowUpload(string container, string blobName)
        {
            const string endpoint = "https://unitaccount.blob.core.windows.net/";
            Blobs.SetupGet(b => b.Uri).Returns(new Uri(endpoint));
            Blobs.Setup(b => b.GetBlobContainerClient(container)).Returns(Container.Object);
            Container.Setup(c => c.CreateIfNotExistsAsync(PublicAccessType.Blob, null, null, It.IsAny<CancellationToken>()))
                .ReturnsAsync(Response.FromValue(BlobsModelFactory.BlobContainerInfo(new ETag("container"), DateTimeOffset.UtcNow), Mock.Of<Response>()));
            Container.Setup(c => c.GetBlobClient(It.IsAny<string>())).Returns(Blob.Object);
            Blob.SetupGet(b => b.Uri).Returns(new Uri(endpoint + container + "/" + blobName));
            Blob.Setup(b => b.UploadAsync(It.IsAny<Stream>(), It.IsAny<BlobUploadOptions>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(Response.FromValue<BlobContentInfo>(null!, Mock.Of<Response>()));
            Blob.Setup(b => b.DeleteIfExistsAsync(It.IsAny<DeleteSnapshotsOption>(), null, It.IsAny<CancellationToken>()))
                .ReturnsAsync(Response.FromValue(true, Mock.Of<Response>()));
        }

        public void VerifyBlobDeleted() => Blob.Verify(b => b.DeleteIfExistsAsync(It.IsAny<DeleteSnapshotsOption>(),
            null, It.IsAny<CancellationToken>()), Times.Once);

        private static Mock<TableClient> Table(string name)
        {
            var table = new Mock<TableClient>(MockBehavior.Strict);
            table.Setup(t => t.CreateIfNotExists(It.IsAny<CancellationToken>()))
                .Returns(Response.FromValue(new TableItem(name), Mock.Of<Response>()));
            return table;
        }
    }
}