using AutomotorasApi.Models;
using Microsoft.Extensions.Logging;

namespace AutomotorasApi.Services;

/// <summary>
/// Reconciles locally authorized entitlements with the provider's canonical
/// preapproval resource. It is intentionally independent from HTTP/webhook
/// input: a missed notification must not leave an entitlement authorized
/// indefinitely.
/// </summary>
public sealed class SubscriptionReconciliationService(
    SubscriptionService subscriptionService,
    DealershipStorageService dealershipService,
    ILogger<SubscriptionReconciliationService> logger)
{
    public async Task<SubscriptionReconciliationResult> ReconcileAuthorizedSubscriptionsAsync(
        CancellationToken cancellationToken = default)
    {
        var examined = 0;
        var applied = 0;
        var skipped = 0;
        var rejected = 0;
        var supersededCanceled = 0;

        // The storage query is deliberately restricted to active root accounts;
        // it must not fan out provider calls for branches or inactive records.
        var candidates = await dealershipService.GetAuthorizedRootSubscriptionsAsync();
        foreach (var candidate in candidates)
        {
            cancellationToken.ThrowIfCancellationRequested();
            examined++;

            try
            {
                var outcome = await ReconcileCandidateAsync(candidate, cancellationToken);
                applied += outcome.Applied ? 1 : 0;
                skipped += outcome.Skipped ? 1 : 0;
                rejected += outcome.Rejected ? 1 : 0;
                supersededCanceled += outcome.SupersededCanceled ? 1 : 0;
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (SubscriptionProviderException)
            {
                // Do not log provider bodies, URLs, credentials or subscription
                // identifiers. The next timer run retries without trusting local
                // data as a replacement for the canonical snapshot.
                rejected++;
                logger.LogWarning("La conciliación programada no pudo validar una suscripción; se reintentará en la próxima ejecución.");
            }
            catch (ApiException)
            {
                // A concurrent ETag transition or a server-side commercial rule
                // never permits a local override from the timer.
                rejected++;
                logger.LogWarning("La conciliación programada encontró un conflicto local; se reintentará en la próxima ejecución.");
            }
            catch (Exception)
            {
                // Keep other accounts reconciling, but avoid attaching arbitrary
                // infrastructure exception text to logs where it may contain
                // connection details.
                rejected++;
                logger.LogError("La conciliación programada falló de forma inesperada para una cuenta; se reintentará en la próxima ejecución.");
            }
        }

        return new SubscriptionReconciliationResult(examined, applied, skipped, rejected, supersededCanceled);
    }

    private async Task<CandidateOutcome> ReconcileCandidateAsync(
        DealershipEntity candidate, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(candidate.RowKey) || string.IsNullOrWhiteSpace(candidate.SubscriptionId))
            return CandidateOutcome.Skip;

        // Re-read before the remote request. The timer's enumeration can be old
        // by the time a checkout, webhook or manual verification changes a row.
        var account = await dealershipService.GetByIdAsync(candidate.RowKey);
        if (!IsCurrentAuthorizedRoot(account, candidate.RowKey, candidate.SubscriptionId))
            return CandidateOutcome.Skip;

        var currentAccount = account!;

        var state = await subscriptionService.GetPreapprovalStatusAsync(currentAccount.SubscriptionId, cancellationToken);

        // GetPreapprovalStatusAsync verifies id/reference syntax, catalog price,
        // currency, period and provider version. These account-bound checks are
        // still required before writing: the remote record must be the current
        // account's stored active subscription and plan.
        if (!string.Equals(state.AccountId, currentAccount.RowKey, StringComparison.Ordinal) ||
            !state.References(currentAccount) ||
            !state.HasMatchingPlan(currentAccount))
        {
            logger.LogWarning("La conciliación programada rechazó un snapshot que no coincide con la cuenta local.");
            return CandidateOutcome.Invalid;
        }

        // ApplySubscriptionAsync re-reads under ETag and retries boundedly, so a
        // racing webhook cannot be overwritten by this older timer iteration.
        var applied = await dealershipService.ApplySubscriptionAsync(
            state.AccountId, state.Plan, state.SubscriptionId, state.Status,
            state.CheckoutAttemptId, state.ProviderVersion);

        var supersededCanceled = await CancelSupersededSubscriptionAsync(currentAccount.RowKey, cancellationToken);
        return new CandidateOutcome(applied, false, false, supersededCanceled);
    }

    private async Task<bool> CancelSupersededSubscriptionAsync(string accountId, CancellationToken cancellationToken)
    {
        // Fetch after ApplySubscriptionAsync because an upgrade may have just
        // recorded a new old-ID to cancel. The clear operation compares the ID
        // under ETag; if anything races, a later run retries safely.
        var account = await dealershipService.GetByIdAsync(accountId);
        if (account is null ||
            !string.Equals(account.RowKey, accountId, StringComparison.Ordinal) ||
            !string.Equals(DealershipStorageService.GetAccountId(account), accountId, StringComparison.Ordinal))
            return false;

        var previousId = account.SupersededSubscriptionId;
        if (string.IsNullOrWhiteSpace(previousId) || SubscriptionState.SameId(previousId, account.SubscriptionId))
            return false;

        // Mercado Pago accepts setting an already-canceled preapproval to
        // canceled, so a timeout after a successful PUT remains safe to retry on
        // the next scheduled execution. Do not clear local state until the
        // provider confirms the exact old ID.
        await subscriptionService.CancelPreapprovalAsync(previousId, cancellationToken);
        return await dealershipService.ClearSupersededSubscriptionAsync(accountId, previousId);
    }

    private static bool IsCurrentAuthorizedRoot(
        DealershipEntity? account, string accountId, string expectedSubscriptionId) =>
        account is not null &&
        !account.IsLoginEmailIndex &&
        string.Equals(account.RowKey, accountId, StringComparison.Ordinal) &&
        string.Equals(DealershipStorageService.GetAccountId(account), accountId, StringComparison.Ordinal) &&
        string.Equals(account.SubscriptionStatus, "authorized", StringComparison.Ordinal) &&
        SubscriptionCatalog.IsSupportedPlan(account.Plan) &&
        SubscriptionState.SameId(account.SubscriptionId, expectedSubscriptionId);

    private sealed record CandidateOutcome(bool Applied, bool Skipped, bool Rejected, bool SupersededCanceled)
    {
        public static readonly CandidateOutcome Skip = new(false, true, false, false);
        public static readonly CandidateOutcome Invalid = new(false, false, true, false);
    }
}

public sealed record SubscriptionReconciliationResult(
    int Examined,
    int Applied,
    int Skipped,
    int Rejected,
    int SupersededCanceled);
