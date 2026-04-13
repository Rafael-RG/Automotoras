using Azure;
using Azure.Data.Tables;

namespace AutomotorasApi.Models;

/// <summary>
/// PartitionKey = Brand (ej: "Porsche", "BMW")
/// RowKey       = GUID del vehículo
/// </summary>
public class VehicleEntity : ITableEntity
{
    public string PartitionKey { get; set; } = string.Empty; // Brand
    public string RowKey { get; set; } = Guid.NewGuid().ToString();
    public DateTimeOffset? Timestamp { get; set; }
    public ETag ETag { get; set; }

    public string Brand { get; set; } = string.Empty;
    public string Model { get; set; } = string.Empty;
    public int Year { get; set; }
    public double Price { get; set; }
    public int Mileage { get; set; }
    public string Transmission { get; set; } = string.Empty;
    public string Fuel { get; set; } = string.Empty;
    public string BodyType { get; set; } = string.Empty;
    public string DealershipId { get; set; } = string.Empty;
    public string ImageUrl { get; set; } = string.Empty;
    public string ImageUrlsJson { get; set; } = string.Empty; // pipe-separated list of all image URLs
    public string Description { get; set; } = string.Empty;
    public bool IsAvailable { get; set; } = true;
    public int ViewCount { get; set; } = 0;
    public int LeadCount { get; set; } = 0;
    public int ShareCount { get; set; } = 0;
    public string CreatedAt { get; set; } = string.Empty;
    public string SoldAt { get; set; } = string.Empty;
}
