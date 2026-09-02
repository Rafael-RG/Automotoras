using AutomotorasApi.Models;
using Azure;
using Azure.Data.Tables;

namespace AutomotorasApi.Services;

public class AdStorageService
{
    private readonly TableClient _tableClient;
    private const string TableName = "Ads";
    private const string Pk = "ad";

    public AdStorageService(TableServiceClient tableServiceClient)
    {
        _tableClient = tableServiceClient.GetTableClient(TableName);
        _tableClient.CreateIfNotExists();
    }

    public async Task<IEnumerable<AdEntity>> GetAllAsync()
    {
        var list = new List<AdEntity>();
        await foreach (var a in _tableClient.QueryAsync<AdEntity>(a => a.PartitionKey == Pk))
            list.Add(a);
        return list.OrderBy(a => a.Timestamp).ToList();
    }

    /// <summary>Banners visibles públicamente: activos y dentro del rango de fechas (si tienen).</summary>
    public async Task<IEnumerable<AdEntity>> GetActiveAsync()
    {
        var now = DateTimeOffset.UtcNow;
        var all = await GetAllAsync();
        return all.Where(a =>
            a.IsActive &&
            (a.StartDate is null || a.StartDate <= now) &&
            (a.EndDate is null || a.EndDate >= now));
    }

    public async Task<AdEntity?> GetByIdAsync(string id)
    {
        try
        {
            var response = await _tableClient.GetEntityAsync<AdEntity>(Pk, id);
            return response.Value;
        }
        catch (RequestFailedException ex) when (ex.Status == 404)
        {
            return null;
        }
    }

    public async Task<AdEntity> CreateAsync(CreateAdRequest request)
    {
        var entity = new AdEntity
        {
            RowKey = Guid.NewGuid().ToString(),
            Title = request.Title,
            LinkUrl = request.LinkUrl,
            IsActive = request.IsActive,
            StartDate = request.StartDate,
            EndDate = request.EndDate,
        };

        await _tableClient.AddEntityAsync(entity);
        return entity;
    }

    public async Task<AdEntity?> UpdateAsync(string id, UpdateAdRequest request)
    {
        var existing = await GetByIdAsync(id);
        if (existing is null) return null;

        existing.Title = request.Title;
        existing.LinkUrl = request.LinkUrl;
        existing.IsActive = request.IsActive;
        existing.StartDate = request.StartDate;
        existing.EndDate = request.EndDate;

        await _tableClient.UpdateEntityAsync(existing, existing.ETag);
        return existing;
    }

    public async Task<bool> UpdateImageUrlAsync(string id, string imageUrl)
    {
        var existing = await GetByIdAsync(id);
        if (existing is null) return false;

        existing.ImageUrl = imageUrl;
        await _tableClient.UpdateEntityAsync(existing, existing.ETag);
        return true;
    }

    public async Task<bool> DeleteAsync(string id)
    {
        var existing = await GetByIdAsync(id);
        if (existing is null) return false;

        await _tableClient.DeleteEntityAsync(existing.PartitionKey, existing.RowKey);
        return true;
    }

    public static AdDto ToDto(AdEntity e) =>
        new(e.RowKey, e.Title, e.ImageUrl, e.LinkUrl, e.IsActive, e.StartDate, e.EndDate);
}
