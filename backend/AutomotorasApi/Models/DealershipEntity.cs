using Azure;
using Azure.Data.Tables;

namespace AutomotorasApi.Models;

/// <summary>
/// PartitionKey = "dealership" (fijo)
/// RowKey       = GUID de la automotora
/// </summary>
public class DealershipEntity : ITableEntity
{
    public string PartitionKey { get; set; } = "dealership";
    public string RowKey { get; set; } = Guid.NewGuid().ToString();
    public DateTimeOffset? Timestamp { get; set; }
    public ETag ETag { get; set; }

    public string Name { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public string City { get; set; } = string.Empty;
    public string Country { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;

    // Public contact information. This is deliberately independent from the
    // address used to sign in or recover the account.
    public string Email { get; set; } = string.Empty;
    public string LogoUrl { get; set; } = string.Empty;
    public double Latitude { get; set; }
    public double Longitude { get; set; }

    // Account ownership. A root account points to its own RowKey; a branch
    // points to the RowKey of that root account. Older rows did not have this
    // property, and an empty value is therefore interpreted as a root by the
    // storage service.
    public string OwnerAccountId { get; set; } = string.Empty;

    // Internal, same-partition uniqueness reservation for LoginEmail. These
    // rows are never a dealership and must be ignored by public/admin queries.
    // Keeping the reservation in the dealership partition lets registration
    // atomically add both it and the root account in one table transaction.
    public bool IsLoginEmailIndex { get; set; }
    public string IndexedAccountId { get; set; } = string.Empty;

    // Root-account reservation counter for the total number of managed
    // dealerships (the root itself plus branches). Zero means a legacy row and
    // is initialized from the existing rows on the first branch creation.
    public int ManagedDealershipCount { get; set; }

    // Subscription
    public string Plan { get; set; } = "basic";            // "basic" | "plus"
    public string SubscriptionId { get; set; } = string.Empty;
    public string SubscriptionStatus { get; set; } = string.Empty; // "authorized" | "paused" | "canceled" | "pending"

    // Mercado Pago's monotonic preapproval version for SubscriptionId. -1 means
    // legacy/unknown; a newer provider snapshot must never be overwritten by an
    // older one that finished its network request later.
    public long SubscriptionProviderVersion { get; set; } = -1;

    // Pending upgrade (initiated but not yet confirmed by webhook)
    public string PendingPlan { get; set; } = string.Empty;
    public string PendingSubscriptionId { get; set; } = string.Empty;
    public long PendingSubscriptionProviderVersion { get; set; } = -1;

    // A checkout is reserved before contacting the payment provider. This keeps
    // retries and concurrent browser requests from creating orphaned billable
    // preapprovals when the provider response is delayed or lost.
    public string CheckoutAttemptId { get; set; } = string.Empty;
    public string CheckoutPlan { get; set; } = string.Empty;
    public DateTimeOffset? CheckoutStartedAt { get; set; }

    // Once an upgrade is authorized, the old subscription is retained here until
    // Mercado Pago confirms its cancellation. Retrying this is safer than risking
    // recurring charges from both preapprovals.
    public string SupersededSubscriptionId { get; set; } = string.Empty;

    // Profile
    public string Bio { get; set; } = string.Empty;
    public string BusinessHours { get; set; } = string.Empty;
    public string Instagram { get; set; } = string.Empty;
    public string TikTok { get; set; } = string.Empty;
    public string Website { get; set; } = string.Empty;

    // Analytics
    public int ProfileViews { get; set; } = 0;
    public int ProfileViewsThisMonth { get; set; } = 0;
    public string ProfileViewsMonthKey { get; set; } = string.Empty;
    public string ProfileViewsHistoryJson { get; set; } = string.Empty; // JSON: {"yyyy-MM": count}

    // Auth
    // LoginEmail is private and must never be projected in a public DTO.
    // Empty is a compatibility fallback to Email for legacy account rows.
    public string LoginEmail { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string PasswordSalt { get; set; } = string.Empty;

    // Incremented in the same ETag update as a password or account-activation
    // change. Browser sessions carry a snapshot and are rejected when stale.
    public long CredentialVersion { get; set; }

    // Email verification
    public bool IsEmailVerified { get; set; } = false;
    public string EmailVerificationToken { get; set; } = string.Empty;
    public DateTimeOffset? EmailVerificationTokenExpiry { get; set; }

    // Password reset
    public string PasswordResetToken { get; set; } = string.Empty;
    public DateTimeOffset? PasswordResetTokenExpiry { get; set; }
}
