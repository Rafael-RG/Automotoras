using AutomotorasApi.Models;
using Azure;
using Azure.Data.Tables;
using System.Security.Cryptography;

namespace AutomotorasApi.Services;

public class DealershipStorageService
{
    private readonly TableClient _tableClient;
    private const string TableName = "Dealerships";
    private const string Pk = "dealership";

    public DealershipStorageService(TableServiceClient tableServiceClient)
    {
        _tableClient = tableServiceClient.GetTableClient(TableName);
        _tableClient.CreateIfNotExists();
    }

    public async Task<IEnumerable<DealershipEntity>> GetAllAsync()
    {
        var list = new List<DealershipEntity>();
        await foreach (var d in _tableClient.QueryAsync<DealershipEntity>(d => d.PartitionKey == Pk))
            list.Add(d);
        return list;
    }

    public async Task<DealershipEntity?> GetByIdAsync(string id)
    {
        try
        {
            var response = await _tableClient.GetEntityAsync<DealershipEntity>(Pk, id);
            return response.Value;
        }
        catch (RequestFailedException ex) when (ex.Status == 404)
        {
            return null;
        }
    }

    public async Task<DealershipEntity> CreateAsync(CreateDealershipRequest request)
    {
        var entity = new DealershipEntity
        {
            RowKey = Guid.NewGuid().ToString(),
            Name = request.Name,
            Address = request.Address,
            City = request.City,
            Country = request.Country,
            Phone = request.Phone,
            Email = request.Email,
            Latitude = request.Latitude,
            Longitude = request.Longitude,
        };

        await _tableClient.AddEntityAsync(entity);
        return entity;
    }

    public async Task<DealershipEntity?> UpdateAsync(string id, UpdateDealershipRequest request)
    {
        var existing = await GetByIdAsync(id);
        if (existing is null) return null;

        existing.Name = request.Name;
        existing.Address = request.Address;
        existing.City = request.City;
        existing.Country = request.Country;
        existing.Phone = request.Phone;
        existing.Email = request.Email;
        existing.Latitude = request.Latitude;
        existing.Longitude = request.Longitude;

        await _tableClient.UpdateEntityAsync(existing, existing.ETag);
        return existing;
    }

    public async Task<bool> UpdateLogoUrlAsync(string id, string logoUrl)
    {
        var existing = await GetByIdAsync(id);
        if (existing is null) return false;

        existing.LogoUrl = logoUrl;
        await _tableClient.UpdateEntityAsync(existing, existing.ETag);
        return true;
    }

    public async Task<int> DeleteAllAsync()
    {
        var all = (await GetAllAsync()).ToList();
        foreach (var d in all)
            await _tableClient.DeleteEntityAsync(d.PartitionKey, d.RowKey);
        return all.Count;
    }

    public static DealershipDto ToDto(DealershipEntity e) =>
        new(e.RowKey, e.Name, e.Address, e.City, e.Country, e.Phone, e.Email, e.LogoUrl, e.Latitude, e.Longitude, e.Plan, e.SubscriptionStatus);

    public async Task<bool> UpdatePlanAsync(string id, string plan, string subscriptionId, string status)
    {
        var existing = await GetByIdAsync(id);
        if (existing is null) return false;

        existing.Plan = plan;
        existing.SubscriptionId = string.IsNullOrWhiteSpace(subscriptionId) ? existing.SubscriptionId : subscriptionId;
        existing.SubscriptionStatus = status;

        await _tableClient.UpdateEntityAsync(existing, existing.ETag);
        return true;
    }

    public async Task<DealershipEntity?> GetByEmailAsync(string email)
    {
        await foreach (var d in _tableClient.QueryAsync<DealershipEntity>(d => d.PartitionKey == Pk && d.Email == email))
            return d;
        return null;
    }

    public async Task<(DealershipEntity entity, bool emailExists)> RegisterWithCredentialsAsync(RegisterRequest request)
    {
        var existing = await GetByEmailAsync(request.Email);
        if (existing is not null)
            return (null!, true);

        var (hash, salt) = HashPassword(request.Password);
        var entity = new DealershipEntity
        {
            RowKey = Guid.NewGuid().ToString(),
            Name = request.Name,
            Email = request.Email,
            Phone = request.Phone,
            Address = request.Address,
            City = request.City,
            Country = request.Country,
            Plan = "basic",
            PasswordHash = hash,
            PasswordSalt = salt,
        };
        await _tableClient.AddEntityAsync(entity);
        return (entity, false);
    }

    public static bool VerifyPassword(string password, string hash, string salt)
    {
        var saltBytes = Convert.FromBase64String(salt);
        using var pbkdf2 = new Rfc2898DeriveBytes(password, saltBytes, 100_000, HashAlgorithmName.SHA256);
        var computed = Convert.ToBase64String(pbkdf2.GetBytes(32));
        return CryptographicOperations.FixedTimeEquals(
            System.Text.Encoding.UTF8.GetBytes(computed),
            System.Text.Encoding.UTF8.GetBytes(hash));
    }

    private static (string hash, string salt) HashPassword(string password)
    {
        var saltBytes = new byte[16];
        RandomNumberGenerator.Fill(saltBytes);
        var salt = Convert.ToBase64String(saltBytes);
        using var pbkdf2 = new Rfc2898DeriveBytes(password, saltBytes, 100_000, HashAlgorithmName.SHA256);
        var hash = Convert.ToBase64String(pbkdf2.GetBytes(32));
        return (hash, salt);
    }
}
