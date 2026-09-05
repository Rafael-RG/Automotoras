using System.Text;
using AutomotorasApi.Functions;
using AutomotorasApi.Models;
using AutomotorasApi.Services;
using Azure;
using Azure.Data.Tables;
using Azure.Data.Tables.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace AutomotorasApi.Tests;

public class RequestAuthorizationTests
{
    [Fact]
    public async Task Logout_WithoutCsrfToken_IsRejectedBeforeSessionRevocation()
    {
        var fixture = new SessionFixture();
        var creation = await fixture.CreateSessionAsync();
        var request = fixture.RequestWithSession(HttpMethods.Post, creation);
        var functions = new AuthFunctions(fixture.DealershipStorage, new EmailService(fixture.Configuration),
            fixture.SessionStorage, fixture.Authorizer, fixture.Configuration, NullLogger<AuthFunctions>.Instance);

        var error = await Assert.ThrowsAsync<ApiException>(() => functions.Logout(request));

        Assert.Equal(403, error.StatusCode);
        Assert.Equal("csrf_invalid", error.Code);
        fixture.Sessions.Verify(t => t.UpdateEntityAsync(It.IsAny<SessionEntity>(), It.IsAny<ETag>(),
            TableUpdateMode.Replace, It.IsAny<CancellationToken>()), Times.Never);
        Assert.False(request.HttpContext.Response.Headers.ContainsKey("Set-Cookie"));
    }

    [Fact]
    public async Task RequireUser_PostWithTheDerivedCsrfToken_AllowsTheSession()
    {
        var fixture = new SessionFixture();
        var creation = await fixture.CreateSessionAsync();
        var request = fixture.RequestWithSession(HttpMethods.Post, creation);
        request.Headers["X-CSRF-Token"] = creation.CsrfToken;

        var user = await fixture.Authorizer.RequireUserAsync(request);

        Assert.Equal("account-a", user.AccountId);
        Assert.False(user.IsPlatformAdmin);
    }

    [Fact]
    public async Task RequireUser_RejectsSessionAfterTheAccountCredentialVersionChanges()
    {
        var fixture = new SessionFixture();
        var creation = await fixture.CreateSessionAsync();
        fixture.Account.CredentialVersion++;
        var request = fixture.RequestWithSession(HttpMethods.Get, creation);

        var error = await Assert.ThrowsAsync<ApiException>(() => fixture.Authorizer.RequireUserAsync(request));

        Assert.Equal(401, error.StatusCode);
        Assert.Equal("session_required", error.Code);
        Assert.Equal(0, creation.Session.CredentialVersion);
        Assert.Equal(1, fixture.Account.CredentialVersion);
    }

    [Theory]
    [InlineData(null, "https://attacker.example.invalid", "write_not_trusted")]
    [InlineData("RedAutos", "https://attacker.example.invalid", "origin_not_allowed")]
    public async Task TrustedAnonymousWrites_RejectMissingAppHeaderAndUntrustedOrigins(
        string? requestedWith, string origin, string expectedCode)
    {
        var fixture = new SessionFixture();
        var request = new DefaultHttpContext().Request;
        request.Method = HttpMethods.Post;
        request.Headers["Origin"] = origin;
        if (requestedWith is not null) request.Headers["X-Requested-With"] = requestedWith;

        var error = await Assert.ThrowsAsync<ApiException>(() => fixture.Authorizer.RequireTrustedWriteAsync(request));

        Assert.Equal(403, error.StatusCode);
        Assert.Equal(expectedCode, error.Code);
    }

    private sealed class SessionFixture
    {
        private readonly Mock<TableClient> _dealerships = Table("Dealerships");
        public Mock<TableClient> Sessions { get; } = Table("Sessions");
        public DealershipEntity Account { get; } = new()
        {
            PartitionKey = "dealership",
            RowKey = "account-a",
            OwnerAccountId = "account-a",
        };
        public IConfiguration Configuration { get; }
        public DealershipStorageService DealershipStorage { get; }
        public SessionStorageService SessionStorage { get; }
        public RequestAuthorizer Authorizer { get; }

        public SessionFixture()
        {
            var tables = new Mock<TableServiceClient>(MockBehavior.Strict);
            tables.Setup(t => t.GetTableClient("Dealerships")).Returns(_dealerships.Object);
            tables.Setup(t => t.GetTableClient("Sessions")).Returns(Sessions.Object);
            _dealerships.Setup(t => t.GetEntityAsync<DealershipEntity>(
                    "dealership", "account-a", null, It.IsAny<CancellationToken>()))
                .ReturnsAsync(Response.FromValue(Account, Mock.Of<Response>()));
            Configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Session:SecureCookies"] = "false",
                ["Session:SameSite"] = "Strict",
                ["Session:LifetimeMinutes"] = "60",
            }).Build();
            DealershipStorage = new DealershipStorageService(tables.Object);
            SessionStorage = new SessionStorageService(tables.Object, Configuration);
            Authorizer = new RequestAuthorizer(SessionStorage, DealershipStorage, Configuration);
        }

        public async Task<SessionCreationResult> CreateSessionAsync(long credentialVersion = 0)
        {
            var creationRequest = new DefaultHttpContext().Request;
            SessionEntity? stored = null;
            Sessions.Setup(t => t.AddEntityAsync(It.IsAny<SessionEntity>(), It.IsAny<CancellationToken>()))
                .Callback<SessionEntity, CancellationToken>((entity, _) => stored = entity)
                .ReturnsAsync(Mock.Of<Response>());

            var creation = await SessionStorage.CreateAsync("account-a", false, creationRequest, credentialVersion);
            Assert.Same(creation.Session, stored);
            Sessions.Setup(t => t.GetEntityAsync<SessionEntity>(SessionEntity.SessionsPartitionKey,
                    creation.Session.RowKey, null, It.IsAny<CancellationToken>()))
                .ReturnsAsync(Response.FromValue(creation.Session, Mock.Of<Response>()));
            return creation;
        }

        public HttpRequest RequestWithSession(string method, SessionCreationResult creation)
        {
            var request = new DefaultHttpContext().Request;
            request.Method = method;
            request.Headers.Cookie = $"{SessionStorage.CookieName}={creation.CookieValue}";
            return request;
        }

        private static Mock<TableClient> Table(string name)
        {
            var table = new Mock<TableClient>(MockBehavior.Strict);
            table.Setup(t => t.CreateIfNotExists(It.IsAny<CancellationToken>()))
                .Returns(Response.FromValue(new TableItem(name), Mock.Of<Response>()));
            return table;
        }
    }
}
