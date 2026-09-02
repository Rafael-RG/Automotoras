using Azure;
using Azure.Data.Tables;

namespace AutomotorasApi.Models;

/// <summary>
/// Banner publicitario pago, gestionado manualmente desde el panel privado /admin-ads.
/// PartitionKey = "ad" (fijo)
/// RowKey       = GUID del banner
/// </summary>
public class AdEntity : ITableEntity
{
    public string PartitionKey { get; set; } = "ad";
    public string RowKey { get; set; } = Guid.NewGuid().ToString();
    public DateTimeOffset? Timestamp { get; set; }
    public ETag ETag { get; set; }

    public string Title { get; set; } = string.Empty;
    public string ImageUrl { get; set; } = string.Empty;
    public string LinkUrl { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;

    // Vigencia opcional; si son null el banner no tiene límite de fecha en ese extremo
    public DateTimeOffset? StartDate { get; set; }
    public DateTimeOffset? EndDate { get; set; }
}
