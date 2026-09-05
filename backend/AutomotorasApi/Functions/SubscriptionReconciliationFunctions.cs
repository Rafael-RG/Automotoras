using AutomotorasApi.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace AutomotorasApi.Functions;

/// <summary>
/// Safety net for missed payment-provider webhooks. The durable timer monitor
/// in AzureWebJobsStorage schedules this independently of browser activity.
/// </summary>
public sealed class SubscriptionReconciliationFunctions(
    SubscriptionReconciliationService reconciliationService,
    ILogger<SubscriptionReconciliationFunctions> logger)
{
    // Every fifteen minutes bounds the lifetime of a stale authorized
    // entitlement when an otherwise valid cancellation webhook is lost.
    [Function("ReconcileAuthorizedSubscriptions")]
    public async Task ReconcileAuthorizedSubscriptions(
        [TimerTrigger("0 */15 * * * *", UseMonitor = true)] TimerInfo timer,
        CancellationToken cancellationToken)
    {
        var result = await reconciliationService.ReconcileAuthorizedSubscriptionsAsync(cancellationToken);
        logger.LogInformation(
            "Conciliación programada terminada: examinadas {Examined}, aplicadas {Applied}, omitidas {Skipped}, rechazadas {Rejected}, suscripciones previas canceladas {SupersededCanceled}.",
            result.Examined, result.Applied, result.Skipped, result.Rejected, result.SupersededCanceled);
    }
}
