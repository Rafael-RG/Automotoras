using AutomotorasApi.Models;
using Azure;
using Azure.Data.Tables;

namespace AutomotorasApi.Services;

public class VehicleStorageService
{
    private readonly TableClient _tableClient;
    private const string TableName = "Vehicles";
    public const int MaxImagesPerVehicle = 10;

    public VehicleStorageService(TableServiceClient tableServiceClient)
    {
        _tableClient = tableServiceClient.GetTableClient(TableName);
        _tableClient.CreateIfNotExists();
    }

    public async Task<IEnumerable<VehicleEntity>> GetAllAsync(string? brand = null)
    {
        if (!string.IsNullOrEmpty(brand)) ValidateKey(brand, "Marca", 80);
        var vehicles = new List<VehicleEntity>();

        var query = string.IsNullOrEmpty(brand)
            ? _tableClient.QueryAsync<VehicleEntity>()
            : _tableClient.QueryAsync<VehicleEntity>(v => v.PartitionKey == brand);

        await foreach (var vehicle in query)
            vehicles.Add(vehicle);

        return vehicles;
    }

    public async Task<IEnumerable<VehicleEntity>> GetByDealershipAsync(string dealershipId)
    {
        ValidateKey(dealershipId, "Automotora");
        var vehicles = new List<VehicleEntity>();
        // This filter is sent to Table Storage, not applied to the entire public catalog in memory.
        await foreach (var vehicle in _tableClient.QueryAsync<VehicleEntity>(v => v.DealershipId == dealershipId))
            vehicles.Add(vehicle);
        return vehicles;
    }

    public async Task<VehicleEntity?> GetByIdAsync(string brand, string id)
    {
        ValidateKey(brand, "Marca", 80);
        ValidateKey(id, "Vehículo");
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
        ValidateRequest(request);
        // URL ownership belongs to the HTTP boundary; trusted seed calls may still use placeholders.
        var urls = GetRequestedImageUrls(request);

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
            Description = request.Description ?? string.Empty,
            ImageUrl = urls.Length > 0 ? urls[0] : string.Empty,
            ImageUrlsJson = urls.Length > 0 ? string.Join('|', urls) : string.Empty,
            IsAvailable = !request.IsSold && request.IsAvailable,
            IsSold = request.IsSold,
            SoldAt = request.IsSold ? DateTime.UtcNow.ToString("yyyy-MM-dd") : string.Empty,
            CreatedAt = DateTime.UtcNow.ToString("yyyy-MM-dd"),
            Color = request.Color ?? string.Empty,
            Doors = request.Doors,
            Engine = request.Engine ?? string.Empty,
            Matricula = request.Matricula ?? string.Empty,
            Padron = request.Padron ?? string.Empty
        };

        await _tableClient.AddEntityAsync(entity);
        return entity;
    }

    public async Task<VehicleEntity?> UpdateAsync(string brand, string id, CreateVehicleRequest request)
    {
        ValidateRequest(request);
        var existing = await GetByIdAsync(brand, id);
        if (existing is null) return null;

        return await UpdateAsync(existing, request);
    }

    // HTTP callers pass the snapshot whose dealership was authorized. A later move/edit must fail,
    // rather than silently re-reading another tenant's entity after the authorization check.
    public async Task<VehicleEntity> UpdateAsync(VehicleEntity existing, CreateVehicleRequest request)
    {
        ValidateRequest(request);
        if (!string.Equals(request.Brand, existing.PartitionKey, StringComparison.Ordinal) ||
            !string.Equals(request.Brand, existing.Brand, StringComparison.Ordinal))
            throw new ApiException(409, "vehicle_brand_immutable",
                "No se puede cambiar la marca de un vehículo existente: cambiaría su clave y sus enlaces. Conservá la marca original.");

        existing.Model = request.Model;
        existing.Year = request.Year;
        existing.Price = request.Price;
        existing.Mileage = request.Mileage;
        existing.Transmission = request.Transmission;
        existing.Fuel = request.Fuel;
        existing.BodyType = request.BodyType;
        existing.DealershipId = request.DealershipId;
        existing.Description = request.Description ?? string.Empty;
        existing.Color = request.Color ?? string.Empty;
        existing.Doors = request.Doors;
        existing.Engine = request.Engine ?? string.Empty;
        if (request.Matricula is not null) existing.Matricula = request.Matricula;
        if (request.Padron is not null) existing.Padron = request.Padron;

        // Sold: mark date when first sold; clear when un-sold
        if (request.IsSold && !existing.IsSold)
            existing.SoldAt = DateTime.UtcNow.ToString("yyyy-MM-dd");
        else if (!request.IsSold)
            existing.SoldAt = string.Empty;
        existing.IsSold = request.IsSold;
        // Sold vehicles are always unavailable
        existing.IsAvailable = request.IsSold ? false : request.IsAvailable;

        // Images are changed exclusively by the image endpoints, not overwritten by a stale form.
        try
        {
            await _tableClient.UpdateEntityAsync(existing, existing.ETag, TableUpdateMode.Merge);
        }
        catch (RequestFailedException ex) when (ex.Status == 412)
        {
            throw TableRetry.Conflict();
        }
        return existing;
    }

    public Task<bool> IncrementEventAsync(string brand, string id, string eventType)
    {
        var normalized = eventType?.ToLowerInvariant();
        if (normalized is not ("view" or "lead" or "share")) return Task.FromResult(false);

        return TableRetry.OnPreconditionFailedAsync(async () =>
        {
            var existing = await GetByIdAsync(brand, id);
            if (existing is null) return false;

            switch (normalized)
            {
                case "view": existing.ViewCount = IncrementCounter(existing.ViewCount); break;
                case "lead": existing.LeadCount = IncrementCounter(existing.LeadCount); break;
                case "share": existing.ShareCount = IncrementCounter(existing.ShareCount); break;
            }

            await _tableClient.UpdateEntityAsync(existing, existing.ETag, TableUpdateMode.Merge);
            return true;
        });
    }

    public Task<bool> AddImageUrlAsync(string brand, string id, string imageUrl, string? expectedDealershipId = null)
    {
        ValidateImageUrls(new[] { imageUrl });
        return TableRetry.OnPreconditionFailedAsync(async () =>
        {
            var existing = await GetByIdAsync(brand, id);
            if (existing is null) return false;
            EnsureDealershipUnchanged(existing, expectedDealershipId);

            var urls = ParseImageUrls(existing).ToList();
            if (urls.Contains(imageUrl, StringComparer.Ordinal)) return true;
            // Check the limit inside the ETag-protected operation, including every retry.
            if (urls.Count >= MaxImagesPerVehicle)
                throw ImageLimitExceeded();
            urls.Add(imageUrl);
            existing.ImageUrlsJson = string.Join('|', urls);
            existing.ImageUrl = urls[0];
            await _tableClient.UpdateEntityAsync(existing, existing.ETag, TableUpdateMode.Merge);
            return true;
        });
    }

    public Task<bool> RemoveImageUrlAsync(string brand, string id, string imageUrl, string? expectedDealershipId = null)
    {
        return TableRetry.OnPreconditionFailedAsync(async () =>
        {
            var existing = await GetByIdAsync(brand, id);
            if (existing is null) return false;
            EnsureDealershipUnchanged(existing, expectedDealershipId);

            var urls = ParseImageUrls(existing).ToList();
            if (!urls.Remove(imageUrl)) return false;
            existing.ImageUrlsJson = string.Join('|', urls);
            existing.ImageUrl = urls.Count > 0 ? urls[0] : string.Empty;
            await _tableClient.UpdateEntityAsync(existing, existing.ETag, TableUpdateMode.Merge);
            return true;
        });
    }

    public async Task<bool> UpdateImageUrlAsync(string brand, string id, string imageUrl)
        => await AddImageUrlAsync(brand, id, imageUrl);

    public async Task<bool> DeleteAsync(string brand, string id)
    {
        var existing = await GetByIdAsync(brand, id);
        return existing is not null && await DeleteAsync(existing);
    }

    public async Task<bool> DeleteAsync(VehicleEntity existing)
    {
        try
        {
            await _tableClient.DeleteEntityAsync(existing.PartitionKey, existing.RowKey, existing.ETag);
            return true;
        }
        catch (RequestFailedException ex) when (ex.Status == 404)
        {
            return false;
        }
        catch (RequestFailedException ex) when (ex.Status == 412)
        {
            throw TableRetry.Conflict();
        }
    }

    public async Task<string[]> GetImageUrlsAsync(string brand, string id)
    {
        var entity = await GetByIdAsync(brand, id);
        return entity is null ? Array.Empty<string>() : ParseImageUrls(entity);
    }

    public VehicleDto ToDto(VehicleEntity e)
    {
        var urls = ParseImageUrls(e);
        return new VehicleDto(
            e.RowKey, e.Brand, e.Model, e.Year, e.Price, e.Mileage,
            e.Transmission, e.Fuel, e.BodyType, e.DealershipId,
            urls.Length > 0 ? urls[0] : string.Empty, urls,
            e.Description, e.IsAvailable,
            e.ViewCount, e.LeadCount, e.ShareCount,
            e.CreatedAt, e.SoldAt, e.IsSold,
            e.Color, e.Doors, e.Engine);
    }

    /// <summary>DTO completo para endpoints de la automotora — incluye matrícula y padrón.</summary>
    public VehicleDealershipDto ToDealershipDto(VehicleEntity e)
    {
        var urls = ParseImageUrls(e);
        return new VehicleDealershipDto(
            e.RowKey, e.Brand, e.Model, e.Year, e.Price, e.Mileage,
            e.Transmission, e.Fuel, e.BodyType, e.DealershipId,
            urls.Length > 0 ? urls[0] : string.Empty, urls,
            e.Description, e.IsAvailable,
            e.ViewCount, e.LeadCount, e.ShareCount,
            e.CreatedAt, e.SoldAt, e.IsSold,
            e.Color, e.Doors, e.Engine,
            e.Matricula, e.Padron);
    }

    public static string[] ParseImageUrls(VehicleEntity e)
    {
        if (!string.IsNullOrEmpty(e.ImageUrlsJson))
            return e.ImageUrlsJson.Split('|', StringSplitOptions.RemoveEmptyEntries);
        if (!string.IsNullOrEmpty(e.ImageUrl))
            return new[] { e.ImageUrl };
        return Array.Empty<string>();
    }

    public static string[] GetRequestedImageUrls(CreateVehicleRequest request) =>
        request.ImageUrls is { Length: > 0 } ? request.ImageUrls :
        !string.IsNullOrEmpty(request.ImageUrl) ? new[] { request.ImageUrl } : Array.Empty<string>();

    public static void ValidateRequest(CreateVehicleRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        ValidateKey(request.Brand, "Marca", 80);
        ValidateKey(request.DealershipId, "Automotora");
        ValidateText(request.Model, "Modelo", 120, required: true);
        ValidateText(request.Transmission, "Transmisión", 50, required: true);
        ValidateText(request.Fuel, "Combustible", 50, required: true);
        ValidateText(request.BodyType, "Carrocería", 50, required: true);
        ValidateText(request.Description, "Descripción", 10_000);
        ValidateText(request.Color, "Color", 80);
        ValidateText(request.Engine, "Motor", 120);
        ValidateText(request.Matricula, "Matrícula", 32);
        ValidateText(request.Padron, "Padrón", 64);

        if (request.Year < 1886 || request.Year > DateTime.UtcNow.Year + 1)
            throw InvalidVehicle("El año debe estar entre 1886 y el próximo año.");
        if (!double.IsFinite(request.Price) || request.Price < 0 || request.Price > 1_000_000_000)
            throw InvalidVehicle("El precio debe ser un número finito entre 0 y 1.000.000.000.");
        if (request.Mileage < 0 || request.Mileage > 10_000_000)
            throw InvalidVehicle("El kilometraje debe estar entre 0 y 10.000.000.");
        if (request.Doors < 0 || request.Doors > 6)
            throw InvalidVehicle("La cantidad de puertas debe estar entre 0 y 6 (0 si no se especifica).");
        ValidateImageUrls(GetRequestedImageUrls(request));
    }

    public static void ValidateKey(string? value, string field, int maxLength = 128)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > maxLength || value != value.Trim() ||
            value is "." or ".." || value.Any(c => char.IsControl(c) || c is '/' or '\\' or '#' or '?'))
            throw InvalidVehicle($"{field}: identificador inválido o demasiado largo (máximo {maxLength} caracteres).");
    }

    public static ApiException ImageLimitExceeded() => new(400, "vehicle_image_limit",
        $"Se permiten como máximo {MaxImagesPerVehicle} imágenes por vehículo.");

    private static void ValidateText(string? value, string field, int maxLength, bool required = false)
    {
        if ((required && string.IsNullOrWhiteSpace(value)) || value?.Length > maxLength || value?.Contains('\0') == true)
            throw InvalidVehicle($"{field}: valor inválido (máximo {maxLength} caracteres).");
    }

    private static void ValidateImageUrls(string[] urls)
    {
        if (urls.Length > MaxImagesPerVehicle) throw ImageLimitExceeded();
        if (urls.Any(url => string.IsNullOrWhiteSpace(url) || url.Length > 2048 ||
                url.Contains('|') || url.Any(char.IsControl) ||
                !Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https")))
            throw InvalidVehicle("Las URLs de las imágenes deben ser válidas y no superar 2048 caracteres.");
        if (urls.Distinct(StringComparer.Ordinal).Count() != urls.Length)
            throw InvalidVehicle("No se puede incluir la misma imagen más de una vez.");
    }

    private static void EnsureDealershipUnchanged(VehicleEntity entity, string? expectedDealershipId)
    {
        if (expectedDealershipId is not null &&
            !string.Equals(entity.DealershipId, expectedDealershipId, StringComparison.Ordinal))
            throw TableRetry.Conflict();
    }

    private static int IncrementCounter(int value) => (int)Math.Clamp((long)value + 1, 0, int.MaxValue);
    private static ApiException InvalidVehicle(string message) => new(400, "invalid_vehicle", message);
}
