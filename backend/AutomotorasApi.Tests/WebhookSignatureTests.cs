using System;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using AutomotorasApi.Models;
using AutomotorasApi.Services;
using Xunit;

namespace AutomotorasApi.Tests;

public class WebhookSignatureTests
{
    private const string SyntheticSecret = "synthetic-only-webhook-fixture-not-a-real-secret";
    private const string RequestId = "request-123";
    private static readonly DateTimeOffset Now = new(2026, 9, 4, 12, 0, 0, TimeSpan.Zero);

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void ValidSignature_AcceptsSecondsOrMillisecondsAndUppercaseResourceIds(bool milliseconds)
    {
        var ts = Timestamp(Now, milliseconds);
        var hash = Sign(ts, "AbC123");

        Assert.True(WebhookSignatureValidator.Validate(
            ts, hash, RequestId, "AbC123", "abc123", SyntheticSecret, Now));
        Assert.True(WebhookSignatureValidator.Validate(
            ts, hash.ToUpperInvariant(), RequestId, "ABC123", "Abc123", SyntheticSecret, Now));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(" ")]
    public void MissingSecret_FailsClosed(string? secret)
    {
        var ts = Timestamp(Now);
        Assert.False(WebhookSignatureValidator.Validate(
            ts, Sign(ts), RequestId, "abc123", "abc123", secret, Now));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData("request;ts:123")]
    [InlineData("request\r\n123")]
    public void MissingOrAmbiguousRequestId_IsRejected(string? requestId)
    {
        var ts = Timestamp(Now);
        Assert.False(WebhookSignatureValidator.Validate(
            ts, Sign(ts), requestId, "abc123", "abc123", SyntheticSecret, Now));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not-hex")]
    [InlineData("0000000000000000000000000000000000000000000000000000000000000000")]
    [InlineData("gggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg")]
    public void MissingMalformedOrIncorrectDigest_IsRejected(string? digest)
    {
        var ts = Timestamp(Now);
        Assert.False(WebhookSignatureValidator.Validate(
            ts, digest, RequestId, "abc123", "abc123", SyntheticSecret, Now));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("NaN")]
    [InlineData("-123456789")]
    [InlineData("1.23456789")]
    [InlineData("01788523200")]
    [InlineData("99999999999999999999999999")]
    public void ImplausibleTimestamp_IsRejected(string? ts)
    {
        Assert.False(WebhookSignatureValidator.Validate(
            ts, Sign(ts ?? string.Empty), RequestId, "abc123", "abc123", SyntheticSecret, Now));
    }

    [Theory]
    [InlineData(-301, false)]
    [InlineData(-300, true)]
    [InlineData(60, true)]
    [InlineData(61, false)]
    public void FreshnessWindow_RejectsOldReplaysAndExcessiveFutureSkew(int seconds, bool accepted)
    {
        var ts = Timestamp(Now.AddSeconds(seconds));
        Assert.Equal(accepted, WebhookSignatureValidator.Validate(
            ts, Sign(ts), RequestId, "abc123", "abc123", SyntheticSecret, Now));
    }

    [Fact]
    public void Freshness_CanBeConfiguredButCannotBeDisabledOrUnbounded()
    {
        var ts = Timestamp(Now.AddMinutes(-6));
        var hash = Sign(ts);
        Assert.False(WebhookSignatureValidator.Validate(ts, hash, RequestId, "abc123", "abc123", SyntheticSecret, Now));
        Assert.True(WebhookSignatureValidator.Validate(ts, hash, RequestId, "abc123", "abc123", SyntheticSecret, Now, TimeSpan.FromMinutes(10)));
        Assert.False(WebhookSignatureValidator.Validate(ts, hash, RequestId, "abc123", "abc123", SyntheticSecret, Now, TimeSpan.Zero));
        Assert.False(WebhookSignatureValidator.Validate(ts, hash, RequestId, "abc123", "abc123", SyntheticSecret, Now, TimeSpan.FromDays(2)));
    }

    [Theory]
    [InlineData("abc123", "another123")]
    [InlineData("another123", "abc123")]
    [InlineData("", "abc123")]
    [InlineData("abc123", "")]
    [InlineData("abc123", "abc123 ")]
    [InlineData("abc123;request-id:other", "abc123")]
    [InlineData("abc%31%32%33", "abc123")]
    [InlineData("ábc123", "abc123")]
    public void SignedQueryAndProcessedBody_MustIdentifyTheSameResource(string queryId, string bodyId)
    {
        var ts = Timestamp(Now);
        Assert.False(WebhookSignatureValidator.Validate(
            ts, Sign(ts), RequestId, queryId, bodyId, SyntheticSecret, Now));
    }

    [Fact]
    public void ChangingRequestIdOrTimestamp_InvalidatesAnOtherwiseValidDigest()
    {
        var ts = Timestamp(Now);
        var hash = Sign(ts);
        Assert.False(WebhookSignatureValidator.Validate(ts, hash, "other-request", "abc123", "abc123", SyntheticSecret, Now));
        Assert.False(WebhookSignatureValidator.Validate(Timestamp(Now.AddSeconds(-1)), hash, RequestId, "abc123", "abc123", SyntheticSecret, Now));
    }

    [Fact]
    public void Parser_AcceptsWhitespaceBetweenUniqueSignatureComponents()
    {
        var ts = Timestamp(Now);
        var hash = Sign(ts);
        Assert.True(WebhookSignatureValidator.TryParseSignature($" ts = {ts} , v1 = {hash} ", out var parsedTs, out var parsedHash));
        Assert.Equal(ts, parsedTs);
        Assert.Equal(hash, parsedHash);
    }

    [Fact]
    public void Parser_RejectsMissingDuplicatedOrUnknownComponents()
    {
        var ts = Timestamp(Now);
        var hash = Sign(ts);
        string?[] invalidHeaders =
        {
            null, "", "ts=", $"ts={ts}", $"v1={hash}",
            $"ts={ts},ts={ts},v1={hash}", $"ts={ts},v1={hash},v1={hash}",
            $"ts={ts},v1={hash},unknown=value", $"ts={ts},v1={hash},", "ts=123,v1=short",
        };

        foreach (var header in invalidHeaders)
            Assert.False(WebhookSignatureValidator.TryParseSignature(header, out _, out _));
    }

    [Fact]
    public void ReplayInsideFreshnessWindow_IsCryptographicallyValidButTransitionIsIdempotent()
    {
        var ts = Timestamp(Now);
        var hash = Sign(ts);
        var account = new DealershipEntity
        {
            RowKey = "account-1", Plan = "basic", SubscriptionId = "active1", SubscriptionStatus = "authorized",
            PendingPlan = "plus", PendingSubscriptionId = "abc123",
        };
        var state = new SubscriptionState("account-1", "plus", "abc123", "authorized");

        Assert.True(WebhookSignatureValidator.Validate(ts, hash, RequestId, "abc123", "abc123", SyntheticSecret, Now));
        Assert.True(state.TryApplyTo(account));
        Assert.True(WebhookSignatureValidator.Validate(ts, hash, RequestId, "abc123", "abc123", SyntheticSecret, Now.AddMinutes(1)));
        Assert.False(state.TryApplyTo(account));
        Assert.False(WebhookSignatureValidator.Validate(ts, hash, RequestId, "abc123", "abc123", SyntheticSecret, Now.AddMinutes(6)));
    }

    private static string Timestamp(DateTimeOffset time, bool milliseconds = false) =>
        (milliseconds ? time.ToUnixTimeMilliseconds() : time.ToUnixTimeSeconds()).ToString(CultureInfo.InvariantCulture);

    // Independent fixture construction; it does not call the validator's normalizer.
    private static string Sign(string ts, string id = "abc123") =>
        Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(SyntheticSecret),
            Encoding.UTF8.GetBytes($"id:{id.ToLowerInvariant()};request-id:{RequestId};ts:{ts};"))).ToLowerInvariant();
}