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
    int ShareCount,
    string CreatedAt,
    string SoldAt,
    bool IsSold
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
    string ProfileViewsHistoryJson
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
    bool IsSold = false
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
    string Password,
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
