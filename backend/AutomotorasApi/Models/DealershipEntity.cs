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
}
