using System.Text.Json;
using AutomotorasApi.Models;
using AutomotorasApi.Services;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace AutomotorasApi.Tests;

public class SecurityPolicyTests
{
    [Fact]
    public void ProductionOrigins_AreOnlyExplicitHttpsOrigins()
    {
        var configuration = Config(new Dictionary<string, string?>
        {
            ["AZURE_FUNCTIONS_ENVIRONMENT"] = "Production",
            ["FrontendUrl"] = "https://app.example.invalid",
            ["Session:TrustedOrigins"] = "https://admin.example.invalid",
        });

        var origins = TrustedOriginPolicy.ReadAllowedOrigins(configuration);

        Assert.Equal(new[] { "https://admin.example.invalid", "https://app.example.invalid" },
            origins.OrderBy(origin => origin).ToArray());
        Assert.DoesNotContain("http://localhost:3000", origins);
        Assert.DoesNotContain(origins, origin => origin.Contains("hostingersite", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void DevelopmentOrigins_AllowOnlyLoopbackHttpAndConfiguredHttps()
    {
        var configuration = Config(new Dictionary<string, string?>
        {
            ["AZURE_FUNCTIONS_ENVIRONMENT"] = "Development",
            ["FrontendUrl"] = "http://localhost:3000",
            ["Session:TrustedOrigins"] = "http://attacker.example.invalid;https://preview.example.invalid",
        });

        var origins = TrustedOriginPolicy.ReadAllowedOrigins(configuration);

        Assert.Contains("http://localhost:3000", origins);
        Assert.Contains("http://localhost:5173", origins);
        Assert.Contains("http://127.0.0.1:5173", origins);
        Assert.Contains("https://preview.example.invalid", origins);
        Assert.DoesNotContain("http://attacker.example.invalid", origins);
    }

    [Fact]
    public void PlatformAdministratorPolicy_ReadsTheCurrentConfiguration()
    {
        var configuration = Config(new Dictionary<string, string?>
        {
            ["PlatformAdmin:Emails"] = "owner@example.invalid",
        });

        Assert.True(PlatformAdministratorPolicy.IsConfigured(configuration, "owner@example.invalid"));

        configuration["PlatformAdmin:Emails"] = "other@example.invalid";

        Assert.False(PlatformAdministratorPolicy.IsConfigured(configuration, "owner@example.invalid"));
    }

    [Theory]
    [InlineData("https://dealer.example.invalid/path", true)]
    [InlineData("https://user:pass@dealer.example.invalid", false)]
    [InlineData("javascript:alert(1)", false)]
    [InlineData("data:text/html,unsafe", false)]
    [InlineData("http://dealer.example.invalid", false)]
    public void PersistedExternalUrls_RequireAbsoluteHttpsWithoutCredentials(string value, bool expected) =>
        Assert.Equal(expected, UrlPolicy.TryNormalizeHttpsUrl(value, out _));

    [Fact]
    public void PublicDealershipDto_OmitsCommercialAndAnalyticsFields()
    {
        var entity = new DealershipEntity
        {
            RowKey = "dealer-a", Name = "Dealer", Plan = "plus", SubscriptionStatus = "authorized",
            ProfileViews = 200, ProfileViewsThisMonth = 20, ProfileViewsHistoryJson = "{\"2026-09\":20}",
            Website = "javascript:alert(1)",
        };

        var json = JsonSerializer.Serialize(DealershipStorageService.ToDto(entity));

        Assert.DoesNotContain("Plan", json, StringComparison.Ordinal);
        Assert.DoesNotContain("SubscriptionStatus", json, StringComparison.Ordinal);
        Assert.DoesNotContain("ProfileViews", json, StringComparison.Ordinal);
        Assert.DoesNotContain("javascript", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void MercadoPagoCanceledSnapshot_IsAcceptedAndCanonicalized()
    {
        const string accountId = "account-1";
        const string subscriptionId = "subscription-1";
        using var doc = JsonDocument.Parse($$"""
        {
          "id":"{{subscriptionId}}",
          "external_reference":"{{accountId}}|basic",
          "status":"canceled",
          "version":1,
          "auto_recurring":{"transaction_amount":2590,"currency_id":"UYU","frequency":1,"frequency_type":"months"}
        }
        """);

        Assert.True(SubscriptionService.TryValidatePreapproval(doc.RootElement, subscriptionId, out var state));
        Assert.Equal("canceled", state!.Status);
    }

    [Fact]
    public void NonceBoundWebhook_CanAdoptOnlyItsMatchingReservation()
    {
        const string attempt = "0123456789abcdef0123456789abcdef";
        var account = new DealershipEntity
        {
            RowKey = "account-1", OwnerAccountId = "account-1", Plan = "basic",
            SubscriptionId = "old-subscription", SubscriptionStatus = "authorized",
            CheckoutAttemptId = attempt, CheckoutPlan = "plus",
        };
        var state = new SubscriptionState("account-1", "plus", "new-subscription", "authorized", CheckoutAttemptId: attempt);

        Assert.True(state.TryApplyTo(account));
        Assert.Equal("plus", account.Plan);
        Assert.Equal("new-subscription", account.SubscriptionId);
        Assert.Equal("old-subscription", account.SupersededSubscriptionId);
        Assert.Empty(account.CheckoutAttemptId);
    }

    private static IConfiguration Config(IDictionary<string, string?> values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values).Build();
}
