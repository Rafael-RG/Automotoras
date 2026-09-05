using System.Linq.Expressions;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AutomotorasApi.Functions;
using AutomotorasApi.Models;
using AutomotorasApi.Services;
using Azure;
using Azure.Data.Tables;
using Azure.Data.Tables.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace AutomotorasApi.Tests;

public class AuthenticationFlowTests
{
    private const string AccountId = "account-a";
    private const string LoginEmail = "owner@example.invalid";
    private const string ContactEmail = "sales@example.invalid";
    private const string Password = "correct horse battery staple";

    [Fact]
    public async Task Login_SetsHttpOnlyOpaqueCookie_WithoutSerializingItsValue()
    {
        var fixture = new AuthFixture();
        var request = JsonRequest("POST", new LoginRequest(LoginEmail, Password));
        fixture.Authorizer.Setup(a => a.RequireTrustedWriteAsync(request)).Returns(Task.CompletedTask);
        fixture.Dealerships.Setup(s => s.GetByLoginEmailAsync(LoginEmail)).ReturnsAsync(fixture.Account);

        SessionEntity? storedSession = null;
        fixture.SessionsTable.Setup(t => t.AddEntityAsync(It.IsAny<SessionEntity>(), It.IsAny<CancellationToken>()))
            .Callback<SessionEntity, CancellationToken>((entity, _) => storedSession = entity)
            .ReturnsAsync(Mock.Of<Response>());

        var result = await fixture.Functions.Login(request);

        var ok = Assert.IsType<OkObjectResult>(result);
        var json = JsonSerializer.Serialize(ok.Value);
        var cookie = Assert.Single(request.HttpContext.Response.Headers.SetCookie)!;
        var prefix = fixture.SessionStorage.CookieName + "=";
        Assert.StartsWith(prefix, cookie);
        var opaqueCookie = cookie[prefix.Length..].Split(';', 2)[0];
        var stored = Assert.IsType<SessionEntity>(storedSession);

        Assert.Matches("^v1\\.[A-Za-z0-9_-]{43}$", opaqueCookie);
        Assert.Contains("HttpOnly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("SameSite=Strict", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(SessionStorageService.HashOpaqueValue(opaqueCookie), stored.TokenHash);
        Assert.DoesNotContain(opaqueCookie, json, StringComparison.Ordinal);
        Assert.DoesNotContain(stored.TokenHash, json, StringComparison.Ordinal);
        Assert.DoesNotContain("CookieValue", json, StringComparison.Ordinal);
        Assert.DoesNotContain("TokenHash", json, StringComparison.Ordinal);
        Assert.Contains(LoginEmail, json, StringComparison.Ordinal);
        Assert.DoesNotContain(ContactEmail, json, StringComparison.Ordinal);
        fixture.Authorizer.Verify(a => a.RequireTrustedWriteAsync(request), Times.Once);
    }

    [Fact]
    public async Task Me_WithoutSession_RejectsAndExpiresTheCookie()
    {
        var fixture = new AuthFixture();
        var request = new DefaultHttpContext().Request;
        request.Method = HttpMethods.Get;

        var error = await Assert.ThrowsAsync<ApiException>(() => fixture.Functions.Me(request));

        Assert.Equal(401, error.StatusCode);
        Assert.Equal("session_required", error.Code);
        Assert.Equal("no-store", request.HttpContext.Response.Headers.CacheControl);
        var cookie = Assert.Single(request.HttpContext.Response.Headers.SetCookie);
        Assert.Contains(fixture.SessionStorage.CookieName + "=", cookie, StringComparison.Ordinal);
        Assert.Contains("Max-Age=0", cookie, StringComparison.OrdinalIgnoreCase);
        fixture.Dealerships.Verify(d => d.GetByIdAsync(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task ResetPassword_RevokesEveryStoredSessionForTheResetAccount()
    {
        var account = Account();
        var resetToken = new string('a', 43);
        account.PasswordResetToken = resetToken;
        account.PasswordResetTokenExpiry = DateTimeOffset.UtcNow.AddMinutes(10);
        var session = new SessionEntity
        {
            PartitionKey = SessionEntity.SessionsPartitionKey,
            RowKey = new string('A', 64),
            TokenHash = new string('A', 64),
            CsrfTokenHash = new string('B', 64),
            AccountId = AccountId,
            CreatedAt = DateTimeOffset.UtcNow.AddMinutes(-10),
            ExpiresAt = DateTimeOffset.UtcNow.AddHours(1),
            ETag = new ETag("session-etag"),
        };
        var dealershipTable = Table("Dealerships");
        var sessionsTable = Table("Sessions");
        var tableService = new Mock<TableServiceClient>(MockBehavior.Strict);
        tableService.Setup(t => t.GetTableClient("Dealerships")).Returns(dealershipTable.Object);
        tableService.Setup(t => t.GetTableClient("Sessions")).Returns(sessionsTable.Object);

        dealershipTable.Setup(t => t.QueryAsync<DealershipEntity>(
                It.IsAny<Expression<Func<DealershipEntity, bool>>>(), It.IsAny<int?>(),
                It.IsAny<IEnumerable<string>>(), It.IsAny<CancellationToken>()))
            .Returns(Pageable(account));
        dealershipTable.Setup(t => t.UpdateEntityAsync(account, account.ETag, TableUpdateMode.Merge,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(Mock.Of<Response>());
        sessionsTable.Setup(t => t.QueryAsync<SessionEntity>(
                It.IsAny<Expression<Func<SessionEntity, bool>>>(), It.IsAny<int?>(),
                It.IsAny<IEnumerable<string>>(), It.IsAny<CancellationToken>()))
            .Returns(Pageable(session));
        sessionsTable.Setup(t => t.GetEntityAsync<SessionEntity>(SessionEntity.SessionsPartitionKey, session.RowKey,
                null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Response.FromValue(session, Mock.Of<Response>()));
        sessionsTable.Setup(t => t.UpdateEntityAsync(session, session.ETag, TableUpdateMode.Replace,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(Mock.Of<Response>());

        var configuration = Configuration();
        var authorizer = new Mock<IRequestAuthorizer>(MockBehavior.Strict);
        var request = JsonRequest("POST", new ResetPasswordRequest(resetToken, "new secure password"));
        authorizer.Setup(a => a.RequireTrustedWriteAsync(request)).Returns(Task.CompletedTask);
        var functions = new AuthFunctions(
            new DealershipStorageService(tableService.Object),
            new EmailService(configuration),
            new SessionStorageService(tableService.Object, configuration),
            authorizer.Object,
            configuration,
            NullLogger<AuthFunctions>.Instance);

        var result = await functions.ResetPassword(request);

        Assert.IsType<OkObjectResult>(result);
        Assert.NotNull(session.RevokedAt);
        Assert.NotEqual(resetToken, account.PasswordResetToken);
        dealershipTable.Verify(t => t.UpdateEntityAsync(account, account.ETag, TableUpdateMode.Merge,
            It.IsAny<CancellationToken>()), Times.Once);
        sessionsTable.Verify(t => t.UpdateEntityAsync(session, session.ETag, TableUpdateMode.Replace,
            It.IsAny<CancellationToken>()), Times.Once);
        authorizer.Verify(a => a.RequireTrustedWriteAsync(request), Times.Once);
    }

    [Fact]
    public async Task VerifyEmail_PreRegisteredAddressInvalidatesPriorPasswordAndRequiresSetup()
    {
        var account = Account();
        var verificationToken = new string('v', 43);
        var previousHash = account.PasswordHash;
        var previousSalt = account.PasswordSalt;
        account.IsEmailVerified = false;
        account.EmailVerificationToken = verificationToken;
        account.EmailVerificationTokenExpiry = DateTimeOffset.UtcNow.AddMinutes(10);

        Assert.True(DealershipStorageService.VerifyPassword(Password, previousHash, previousSalt));

        var dealershipsTable = Table("Dealerships");
        var sessionsTable = Table("Sessions");
        var tableService = new Mock<TableServiceClient>(MockBehavior.Strict);
        tableService.Setup(t => t.GetTableClient("Dealerships")).Returns(dealershipsTable.Object);
        tableService.Setup(t => t.GetTableClient("Sessions")).Returns(sessionsTable.Object);
        dealershipsTable.Setup(t => t.QueryAsync<DealershipEntity>(
                It.IsAny<Expression<Func<DealershipEntity, bool>>>(), It.IsAny<int?>(),
                It.IsAny<IEnumerable<string>>(), It.IsAny<CancellationToken>()))
            .Returns(Pageable(account));
        dealershipsTable.Setup(t => t.UpdateEntityAsync(account, account.ETag, TableUpdateMode.Merge,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(Mock.Of<Response>());
        sessionsTable.Setup(t => t.QueryAsync<SessionEntity>(
                It.IsAny<Expression<Func<SessionEntity, bool>>>(), It.IsAny<int?>(),
                It.IsAny<IEnumerable<string>>(), It.IsAny<CancellationToken>()))
            .Returns(Pageable<SessionEntity>());

        var configuration = Configuration();
        var authorizer = new Mock<IRequestAuthorizer>(MockBehavior.Strict);
        var functions = new AuthFunctions(
            new DealershipStorageService(tableService.Object),
            new EmailService(configuration),
            new SessionStorageService(tableService.Object, configuration),
            authorizer.Object,
            configuration,
            NullLogger<AuthFunctions>.Instance);
        var verifyRequest = new DefaultHttpContext().Request;
        verifyRequest.Method = HttpMethods.Get;
        verifyRequest.QueryString = new QueryString($"?token={verificationToken}");

        var result = await functions.VerifyEmail(verifyRequest);

        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Contains("\"passwordSetupRequired\":true", JsonSerializer.Serialize(ok.Value), StringComparison.Ordinal);
        Assert.True(account.IsEmailVerified);
        Assert.Equal(string.Empty, account.PasswordHash);
        Assert.Equal(string.Empty, account.PasswordSalt);
        Assert.False(DealershipStorageService.VerifyPassword(Password, account.PasswordHash, account.PasswordSalt));
        Assert.Equal(verificationToken, account.PasswordResetToken);
        Assert.NotNull(account.PasswordResetTokenExpiry);
        Assert.True(account.PasswordResetTokenExpiry > DateTimeOffset.UtcNow);
        Assert.Equal(string.Empty, account.EmailVerificationToken);

        var loginRequest = JsonRequest("POST", new LoginRequest(LoginEmail, Password));
        authorizer.Setup(a => a.RequireTrustedWriteAsync(loginRequest)).Returns(Task.CompletedTask);

        var loginError = await Assert.ThrowsAsync<ApiException>(() => functions.Login(loginRequest));

        Assert.Equal(401, loginError.StatusCode);
        Assert.Equal("invalid_credentials", loginError.Code);
        Assert.Equal(1, account.CredentialVersion);
        dealershipsTable.Verify(t => t.UpdateEntityAsync(account, account.ETag, TableUpdateMode.Merge,
            It.IsAny<CancellationToken>()), Times.Once);
    }

    private static AsyncPageable<T> Pageable<T>(params T[] values) where T : notnull =>
        AsyncPageable<T>.FromPages(new[] { Page<T>.FromValues(values, null, Mock.Of<Response>()) });

    private static Mock<TableClient> Table(string name)
    {
        var table = new Mock<TableClient>(MockBehavior.Strict);
        table.Setup(t => t.CreateIfNotExists(It.IsAny<CancellationToken>()))
            .Returns(Response.FromValue(new TableItem(name), Mock.Of<Response>()));
        if (string.Equals(name, "Dealerships", StringComparison.Ordinal))
        {
            table.Setup(t => t.GetEntityAsync<DealershipEntity>("dealership",
                    It.Is<string>(key => key.StartsWith("email-index:", StringComparison.Ordinal)), null,
                    It.IsAny<CancellationToken>()))
                .ThrowsAsync(new RequestFailedException(404, "Not found", null, null));
        }
        return table;
    }

    private static IConfiguration Configuration() =>
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Session:SecureCookies"] = "false",
            ["Session:SameSite"] = "Strict",
            ["Session:LifetimeMinutes"] = "60",
        }).Build();

    private static HttpRequest JsonRequest<T>(string method, T body)
    {
        var request = new DefaultHttpContext().Request;
        request.Method = method;
        request.ContentType = "application/json";
        request.Body = new MemoryStream(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(body)));
        return request;
    }

    private static DealershipEntity Account()
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        using var pbkdf2 = new Rfc2898DeriveBytes(Password, salt, 100_000, HashAlgorithmName.SHA256);
        return new DealershipEntity
        {
            RowKey = AccountId,
            OwnerAccountId = AccountId,
            Name = "Owner",
            Email = ContactEmail,
            LoginEmail = LoginEmail,
            PasswordSalt = Convert.ToBase64String(salt),
            PasswordHash = Convert.ToBase64String(pbkdf2.GetBytes(32)),
            IsEmailVerified = true,
            ETag = new ETag("account-etag"),
        };
    }

    private sealed class AuthFixture
    {
        public Mock<TableClient> SessionsTable { get; } = Table("Sessions");
        public Mock<DealershipStorageService> Dealerships { get; }
        public Mock<IRequestAuthorizer> Authorizer { get; } = new(MockBehavior.Strict);
        public SessionStorageService SessionStorage { get; }
        public DealershipEntity Account { get; } = AuthenticationFlowTests.Account();
        public AuthFunctions Functions { get; }

        public AuthFixture()
        {
            var dealershipsTable = Table("Dealerships");
            var tableService = new Mock<TableServiceClient>(MockBehavior.Strict);
            tableService.Setup(t => t.GetTableClient("Dealerships")).Returns(dealershipsTable.Object);
            tableService.Setup(t => t.GetTableClient("Sessions")).Returns(SessionsTable.Object);
            Dealerships = new Mock<DealershipStorageService>(MockBehavior.Strict, tableService.Object);
            var configuration = Configuration();
            SessionStorage = new SessionStorageService(tableService.Object, configuration);
            Functions = new AuthFunctions(Dealerships.Object, new EmailService(configuration), SessionStorage,
                Authorizer.Object, configuration, NullLogger<AuthFunctions>.Instance);
        }
    }
}
