namespace AutomotorasApi.Models;

// --- Response DTOs ---

/// <summary>DTO público — no incluye matrícula ni padrón.</summary>
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
    int ShareCount,
    string CreatedAt,
    string SoldAt,
    bool IsSold,
    string Color,
    int Doors,
    string Engine
);

/// <summary>DTO extendido para la automotora — incluye campos privados.</summary>
public record VehicleDealershipDto(
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
    int ShareCount,
    string CreatedAt,
    string SoldAt,
    bool IsSold,
    string Color,
    int Doors,
    string Engine,
    // Campos privados
    string Matricula,
    string Padron
);

/// <summary>Public dealership profile; commercial data stays private.</summary>
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
    double Longitude,
    string Bio,
    string BusinessHours,
    string Instagram,
    string TikTok,
    string Website
);

/// <summary>
/// Contract for an authenticated account's branch list. It intentionally keeps
/// the same public profile fields as <see cref="DealershipDto"/>, but adds the
/// canonical account identifier used by the admin client to scope selections.
/// LoginEmail and credentials remain server-only.
/// </summary>
public record AdminDealershipDto(
    string Id,
    string Name,
    string Address,
    string City,
    string Country,
    string Phone,
    string Email,
    string LogoUrl,
    double Latitude,
    double Longitude,
    string Plan,
    string SubscriptionStatus,
    string Bio,
    string BusinessHours,
    string Instagram,
    string TikTok,
    string Website,
    int ProfileViews,
    int ProfileViewsThisMonth,
    string ProfileViewsHistoryJson,
    string AccountId
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
    bool IsAvailable = true,
    string[]? ImageUrls = null,
    bool IsSold = false,
    // Opcionales públicos
    string Color = "",
    int Doors = 0,
    string Engine = "",
    // Privados (solo automotora)
    string? Matricula = null,
    string? Padron = null
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
    double Longitude = 0,
    string Bio = "",
    string BusinessHours = "",
    string Instagram = "",
    string TikTok = "",
    string Website = ""
);

public record UploadImageResponse(string Url);

// --- Auth DTOs ---
public record RegisterRequest(
    string Name,
    string Email,
    // Kept optional for backward-compatible JSON clients. Passwords are only
    // accepted after the holder proves email ownership through the link.
    string? Password = null,
    string Phone = "",
    string Address = "",
    string City = "",
    string Country = ""
);

public record LoginRequest(string Email, string Password);

public record AuthResponse(
    string DealershipId,
    string Name,
    string Email,
    string Plan,
    string SubscriptionStatus
);

public record ForgotPasswordRequest(string Email);
public record ResetPasswordRequest(string Token, string NewPassword);

public record TrackEventRequest(string Type); // "view" | "lead" | "share"

public record SubscriptionPaymentRecord(string Date, decimal Amount, string Currency, string Status);
public record SubscriptionInfoDto(string Status, string NextPaymentDate, SubscriptionPaymentRecord[] Payments);

public record CreateCheckoutRequest(string DealershipId, string Plan, string BackUrl);
public record CheckoutResponse(string CheckoutUrl);
public record SubscriptionWebhookPayload(string? Id, string? Type, string? Topic, WebhookData? Data);
public record WebhookData(string? Id);

// --- Ads DTOs ---
public record AdDto(
    string Id,
    string Title,
    string ImageUrl,
    string LinkUrl,
    bool IsActive,
    DateTimeOffset? StartDate,
    DateTimeOffset? EndDate
);

public record CreateAdRequest(
    string Title,
    string LinkUrl,
    bool IsActive = true,
    DateTimeOffset? StartDate = null,
    DateTimeOffset? EndDate = null
);

public record UpdateAdRequest(
    string Title,
    string LinkUrl,
    bool IsActive = true,
    DateTimeOffset? StartDate = null,
    DateTimeOffset? EndDate = null
);
