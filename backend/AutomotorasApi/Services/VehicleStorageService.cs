using AutomotorasApi.Models;
using Azure;
using Azure.Data.Tables;

namespace AutomotorasApi.Services;

public class VehicleStorageService
{
    private readonly TableClient _tableClient;
    private const string TableName = "Vehicles";

    public VehicleStorageService(TableServiceClient tableServiceClient)
    {
        _tableClient = tableServiceClient.GetTableClient(TableName);
        _tableClient.CreateIfNotExists();
    }

    public async Task<IEnumerable<VehicleEntity>> GetAllAsync(string? brand = null)
    {
        var vehicles = new List<VehicleEntity>();

        var query = string.IsNullOrEmpty(brand)
            ? _tableClient.QueryAsync<VehicleEntity>()
            : _tableClient.QueryAsync<VehicleEntity>(v => v.PartitionKey == brand);

        await foreach (var vehicle in query)
            vehicles.Add(vehicle);

        return vehicles;
    }

    public async Task<VehicleEntity?> GetByIdAsync(string brand, string id)
    {
        try
        {
            var response = await _tableClient.GetEntityAsync<VehicleEntity>(brand, id);
            return response.Value;
        }
        catch (RequestFailedException ex) when (ex.Status == 404)
        {
            return null;
        }
    }

    public async Task<VehicleEntity> CreateAsync(CreateVehicleRequest request)
    {
        // Use ImageUrls array if provided (preferred), else fall back to ImageUrl string
        var urls = request.ImageUrls != null && request.ImageUrls.Length > 0
            ? request.ImageUrls
            : (!string.IsNullOrEmpty(request.ImageUrl) ? new[] { request.ImageUrl } : Array.Empty<string>());

        var entity = new VehicleEntity
        {
            PartitionKey = request.Brand,
            RowKey = Guid.NewGuid().ToString(),
            Brand = request.Brand,
            Model = request.Model,
            Year = request.Year,
            Price = request.Price,
            Mileage = request.Mileage,
            Transmission = request.Transmission,
            Fuel = request.Fuel,
            BodyType = request.BodyType,
            DealershipId = request.DealershipId,
            Description = request.Description,
            ImageUrl = urls.Length > 0 ? urls[0] : string.Empty,
            ImageUrlsJson = urls.Length > 0 ? string.Join('|', urls) : string.Empty,
            IsAvailable = request.IsAvailable
        };

        await _tableClient.AddEntityAsync(entity);
        return entity;
    }

    public async Task<VehicleEntity?> UpdateAsync(string brand, string id, CreateVehicleRequest request)
    {
        var existing = await GetByIdAsync(brand, id);
        if (existing is null) return null;

        existing.Brand = request.Brand;
        existing.Model = request.Model;
        existing.Year = request.Year;
        existing.Price = request.Price;
        existing.Mileage = request.Mileage;
        existing.Transmission = request.Transmission;
        existing.Fuel = request.Fuel;
        existing.BodyType = request.BodyType;
        existing.DealershipId = request.DealershipId;
        existing.Description = request.Description;
        existing.IsAvailable = request.IsAvailable;

        await _tableClient.UpdateEntityAsync(existing, existing.ETag);
        return existing;
    }

    public async Task<bool> IncrementEventAsync(string brand, string id, string eventType)
    {
        var existing = await GetByIdAsync(brand, id);
        if (existing is null) return false;

        switch (eventType.ToLowerInvariant())
        {
            case "view":  existing.ViewCount++;  break;
            case "lead":  existing.LeadCount++;  break;
            case "share": existing.ShareCount++; break;
            default: return false;
        }

        await _tableClient.UpdateEntityAsync(existing, existing.ETag);
        return true;
    }

    public async Task<bool> AddImageUrlAsync(string brand, string id, string imageUrl)
    {
        var existing = await GetByIdAsync(brand, id);
        if (existing is null) return false;

        var urls = ParseImageUrls(existing).ToList();
        urls.Add(imageUrl);
        existing.ImageUrlsJson = string.Join('|', urls);
        existing.ImageUrl = urls[0];
        await _tableClient.UpdateEntityAsync(existing, existing.ETag);
        return true;
    }

    public async Task<bool> RemoveImageUrlAsync(string brand, string id, string imageUrl)
    {
        var existing = await GetByIdAsync(brand, id);
        if (existing is null) return false;

        var urls = ParseImageUrls(existing).ToList();
        urls.Remove(imageUrl);
        existing.ImageUrlsJson = string.Join('|', urls);
        existing.ImageUrl = urls.Count > 0 ? urls[0] : string.Empty;
        await _tableClient.UpdateEntityAsync(existing, existing.ETag);
        return true;
    }

    public async Task<bool> UpdateImageUrlAsync(string brand, string id, string imageUrl)
        => await AddImageUrlAsync(brand, id, imageUrl);

    public async Task<bool> DeleteAsync(string brand, string id)
    {
        try
        {
            await _tableClient.DeleteEntityAsync(brand, id);
            return true;
        }
        catch (RequestFailedException)
        {
            return false;
        }
    }

    public VehicleDto ToDto(VehicleEntity e)
    {
        var urls = ParseImageUrls(e);
        return new VehicleDto(
            e.RowKey, e.Brand, e.Model, e.Year, e.Price, e.Mileage,
            e.Transmission, e.Fuel, e.BodyType, e.DealershipId,
            urls.Length > 0 ? urls[0] : string.Empty, urls,
            e.Description, e.IsAvailable,
            e.ViewCount, e.LeadCount, e.ShareCount);
    }

    private static string[] ParseImageUrls(VehicleEntity e)
    {
        if (!string.IsNullOrEmpty(e.ImageUrlsJson))
            return e.ImageUrlsJson.Split('|', StringSplitOptions.RemoveEmptyEntries);
        if (!string.IsNullOrEmpty(e.ImageUrl))
            return new[] { e.ImageUrl };
        return Array.Empty<string>();
    }
}
