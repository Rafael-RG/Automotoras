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
    public string Email { get; set; } = string.Empty;
    public string LogoUrl { get; set; } = string.Empty;
    public double Latitude { get; set; }
    public double Longitude { get; set; }

    // Subscription
    public string Plan { get; set; } = "basic";            // "basic" | "pro"
    public string SubscriptionId { get; set; } = string.Empty;
    public string SubscriptionStatus { get; set; } = string.Empty; // "authorized" | "paused" | "cancelled" | "pending"

    // Pending upgrade (initiated but not yet confirmed by webhook)
    public string PendingPlan { get; set; } = string.Empty;
    public string PendingSubscriptionId { get; set; } = string.Empty;

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
    public string PasswordHash { get; set; } = string.Empty;
    public string PasswordSalt { get; set; } = string.Empty;

    // Email verification
    public bool IsEmailVerified { get; set; } = false;
    public string EmailVerificationToken { get; set; } = string.Empty;
    public DateTimeOffset? EmailVerificationTokenExpiry { get; set; }

    // Password reset
    public string PasswordResetToken { get; set; } = string.Empty;
    public DateTimeOffset? PasswordResetTokenExpiry { get; set; }
}
