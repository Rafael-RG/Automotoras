namespace AutomotorasApi.Models;

// --- Response DTOs ---

public record VehicleDto(
    string Id,
    string Brand,
    string Model,
    int Year,
    double Price,
    int Mileage,
    string Transmission,
    string Fuel,
    string BodyType,
    string DealershipId,
    string ImageUrl,
    string[] ImageUrls,
    string Description,
    bool IsAvailable,
    int ViewCount,
    int LeadCount,
    int ShareCount
);

public record DealershipDto(
    string Id,
    string Name,
    string Address,
    string City,
    string Country,
    string Phone,
    string Email,
    string LogoUrl,
    double Latitude,
    double Longitude
);

// --- Request DTOs ---

public record CreateVehicleRequest(
    string Brand,
    string Model,
    int Year,
    double Price,
    int Mileage,
    string Transmission,
    string Fuel,
    string BodyType,
    string DealershipId,
    string Description,
    string ImageUrl = "",
    bool IsAvailable = true
);

public record CreateDealershipRequest(
    string Name,
    string Address,
    string City,
    string Country,
    string Phone,
    string Email,
    double Latitude = 0,
    double Longitude = 0
);

public record UpdateDealershipRequest(
    string Name,
    string Address,
    string City,
    string Country,
    string Phone,
    string Email,
    double Latitude = 0,
    double Longitude = 0
);

public record UploadImageResponse(string Url);

public record TrackEventRequest(string Type); // "view" | "lead" | "share"
