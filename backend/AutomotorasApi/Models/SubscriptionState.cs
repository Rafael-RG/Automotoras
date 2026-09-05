namespace AutomotorasApi.Models;

public static class SubscriptionCatalog
{
    public const string Currency = "UYU";
    public const int Frequency = 1;
    public const string FrequencyType = "months";

    public static bool TryGetPlan(string? plan, out (string Reason, decimal Amount) definition)
    {
        definition = plan switch
        {
            "basic" => ("Plan Básico RedAutos – 1 sucursal", 2590m),
            "plus" => ("Plan Plus RedAutos – Hasta 10 sucursales", 3990m),
            _ => (string.Empty, 0m),
        };
        return definition.Amount > 0m;
    }

    public static bool IsSupportedPlan(string? plan) => TryGetPlan(plan, out _);
}

/// <summary>
/// A provider snapshot whose ID, reference, price, currency and billing period have
/// been validated by SubscriptionService. This is not proof of an individual payment.
/// </summary>
/// <summary>A durable local reservation made before a remote checkout POST.</summary>
public sealed record CheckoutReservation(string AccountId, string Plan, string AttemptId);

public sealed record SubscriptionState(
    string AccountId,
    string Plan,
    string SubscriptionId,
    string Status,
    string NextPaymentDate = "",
    string CheckoutAttemptId = "",
    long ProviderVersion = -1)
{
    public static string? NormalizeStatus(string? status) => status switch
    {
        // Mercado Pago sends the US spelling. Accept the old stored spelling
        // only as a backwards-compatible input, but persist provider snapshots
        // using the canonical current spelling.
        "canceled" or "cancelled" => "canceled",
        "pending" or "authorized" or "paused" or "rejected" or "failed" => status,
        _ => null,
    };

    public static bool IsSupportedStatus(string? status) => NormalizeStatus(status) is not null;

    public static bool SameId(string? left, string? right) =>
        !string.IsNullOrWhiteSpace(left) && !string.IsNullOrWhiteSpace(right) &&
        string.Equals(left, right, StringComparison.OrdinalIgnoreCase);

    public bool References(DealershipEntity account) =>
        string.Equals(account.RowKey, AccountId, StringComparison.Ordinal) &&
        (string.IsNullOrWhiteSpace(account.OwnerAccountId) ||
            string.Equals(account.OwnerAccountId, AccountId, StringComparison.Ordinal)) &&
        (SameId(account.PendingSubscriptionId, SubscriptionId) ||
            SameId(account.SubscriptionId, SubscriptionId) ||
            MatchesCheckoutReservation(account));

    public bool HasMatchingPlan(DealershipEntity account)
    {
        if (!References(account)) return false;

        // A reservation can be adopted only when the provider's signed snapshot
        // carries the exact local checkout nonce. Pending takes precedence over
        // active on damaged legacy rows containing the same ID twice.
        var expectedPlan = MatchesCheckoutReservation(account)
            ? account.CheckoutPlan
            : SameId(account.PendingSubscriptionId, SubscriptionId)
                ? account.PendingPlan
                : account.Plan;
        return string.Equals(expectedPlan, Plan, StringComparison.Ordinal);
    }

    /// <summary>
    /// Applies only an in-memory transition. Storage must re-read the root row, call
    /// this method (or implement these same conditions), then persist with its ETag
    /// and bounded conflict retries. False means no write, including duplicate events.
    /// Never use an unconditional merge or clear an unrelated pending checkout.
    /// </summary>
    public bool TryApplyTo(DealershipEntity account)
    {
        var normalizedStatus = NormalizeStatus(Status);
        if (!SubscriptionCatalog.IsSupportedPlan(Plan) || normalizedStatus is null ||
            !HasMatchingPlan(account))
            return false;

        if (MatchesCheckoutReservation(account))
        {
            if (normalizedStatus is "pending" or "paused")
            {
                // The webhook may arrive before the browser receives the POST
                // result. Adopt only the nonce-bound reservation into a normal
                // pending subscription without changing the active entitlement.
                account.PendingPlan = Plan;
                account.PendingSubscriptionId = SubscriptionId;
                account.PendingSubscriptionProviderVersion = ProviderVersion;
            }
            else if (normalizedStatus == "authorized")
            {
                PromoteToActive(account, normalizedStatus);
            }
            // A rejected/failed/canceled checkout only releases its reservation.
            ClearCheckoutReservation(account);
            return true;
        }

        if (SameId(account.PendingSubscriptionId, SubscriptionId))
        {
            if (!IsCurrentPendingSnapshot(account)) return false;

            if (normalizedStatus == "authorized")
            {
                PromoteToActive(account, normalizedStatus);
                return true;
            }

            if (normalizedStatus is "canceled" or "rejected" or "failed")
            {
                ClearPendingCheckout(account);
                return true;
            }

            // An unpaid or paused attempt must not grant or revoke the active
            // plan, but its provider version is durable. Without this marker an
            // earlier authorized snapshot could arrive late and grant access.
            if (ProviderVersion < 0) return false;
            account.PendingSubscriptionProviderVersion = ProviderVersion;
            return true;
        }

        if (!IsCurrentActiveSnapshot(account, normalizedStatus)) return false;

        if (string.Equals(NormalizeStatus(account.SubscriptionStatus), normalizedStatus, StringComparison.Ordinal) &&
            (ProviderVersion < 0 || ProviderVersion == account.SubscriptionProviderVersion))
            return false;

        account.SubscriptionStatus = normalizedStatus;
        if (ProviderVersion >= 0) account.SubscriptionProviderVersion = ProviderVersion;
        return true;
    }

    private bool MatchesCheckoutReservation(DealershipEntity account) =>
        !string.IsNullOrWhiteSpace(CheckoutAttemptId) &&
        SameId(account.CheckoutAttemptId, CheckoutAttemptId) &&
        string.Equals(account.CheckoutPlan, Plan, StringComparison.Ordinal);

    private bool IsCurrentPendingSnapshot(DealershipEntity account) =>
        ProviderVersion < 0 || account.PendingSubscriptionProviderVersion < 0 ||
        ProviderVersion > account.PendingSubscriptionProviderVersion;

    private bool IsCurrentActiveSnapshot(DealershipEntity account, string normalizedStatus)
    {
        if (ProviderVersion < 0) return true;
        if (account.SubscriptionProviderVersion >= 0)
            return ProviderVersion > account.SubscriptionProviderVersion;

        // Legacy rows have no ordering metadata. Do not turn a locally terminal
        // subscription back into an entitlement without a verifiable newer state.
        return !(IsTerminal(NormalizeStatus(account.SubscriptionStatus)) && normalizedStatus == "authorized");
    }

    private void PromoteToActive(DealershipEntity account, string normalizedStatus)
    {
        var previousSubscriptionId = account.SubscriptionId;
        var shouldCancelPrevious = !SameId(previousSubscriptionId, SubscriptionId) &&
            IsCancelable(NormalizeStatus(account.SubscriptionStatus));

        account.Plan = Plan;
        account.SubscriptionId = SubscriptionId;
        account.SubscriptionStatus = normalizedStatus;
        account.SubscriptionProviderVersion = ProviderVersion;
        ClearPendingCheckout(account);
        if (shouldCancelPrevious && string.IsNullOrWhiteSpace(account.SupersededSubscriptionId))
            account.SupersededSubscriptionId = previousSubscriptionId;
    }

    private static bool IsCancelable(string? status) => status is "authorized" or "pending" or "paused";

    private static bool IsTerminal(string? status) => status is "canceled" or "rejected" or "failed";

    private static void ClearPendingCheckout(DealershipEntity account)
    {
        account.PendingPlan = string.Empty;
        account.PendingSubscriptionId = string.Empty;
        account.PendingSubscriptionProviderVersion = -1;
    }

    private static void ClearCheckoutReservation(DealershipEntity account)
    {
        account.CheckoutAttemptId = string.Empty;
        account.CheckoutPlan = string.Empty;
        account.CheckoutStartedAt = null;
    }
}
