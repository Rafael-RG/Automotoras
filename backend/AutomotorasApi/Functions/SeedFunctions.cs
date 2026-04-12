using AutomotorasApi.Models;
using AutomotorasApi.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;

namespace AutomotorasApi.Functions;

/// <summary>
/// POST /api/seed  →  Carga datos de prueba en Table Storage (solo en Development).
/// POST /api/seed/clear  →  Elimina todos los datos de prueba.
/// </summary>
public class SeedFunctions(VehicleStorageService vehicleService, DealershipStorageService dealershipService)
{
    [Function("SeedData")]
    public async Task<IActionResult> SeedData(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "seed")] HttpRequest req)
    {
        if (Environment.GetEnvironmentVariable("AZURE_FUNCTIONS_ENVIRONMENT") != "Development")
            return new ForbidResult();

        // Evitar duplicar si ya existen datos
        var existing = (await dealershipService.GetAllAsync()).ToList();
        if (existing.Count > 0)
            return new OkObjectResult(new { message = "Ya existen datos. Use /api/seed/clear primero.", count = existing.Count });

        // 1. Crear automotoras
        var apex = await dealershipService.CreateAsync(new CreateDealershipRequest(
            "Apex Porsche Stuttgart",
            "Porscheplatz 1",
            "Stuttgart",
            "Germany",
            "+49-711-911-0000",
            "stuttgart@apexvelocity.de",
            48.8371, 9.1559));

        var luxury = await dealershipService.CreateAsync(new CreateDealershipRequest(
            "Luxury Motors Madrid",
            "Paseo de la Castellana 180",
            "Madrid",
            "Spain",
            "+34-91-700-0000",
            "madrid@apexvelocity.es",
            40.4584, -3.6878));

        // 2. Crear vehículos
        var seedVehicles = new[]
        {
            new CreateVehicleRequest(
                "Porsche", "911 Carrera S", 2022, 132500, 8400, "PDK 8-Speed", "Gasoline",
                apex.RowKey,
                "Porsche 911 Carrera S en estado impecable. Un ícono de la ingeniería alemana.",
                "https://lh3.googleusercontent.com/aida-public/AB6AXuCOMbAZQgMf0QYqRi-TWzuu-0S06hRccKupQavtyC1E_61NdVLcUlGHNDjej0783zwcy3taLC17vUtumi7XRaKJsG-UL5fbVuXB1I7uIuY-zOglAhMKFZpabKWw-W2A2ipVggA07g1Pvnp2gynlt9Y9YK4N0DGA5Gq2x-OEli5w3p_cq2AktcA0H4vNsEGw16rw8pWr3rN6Qe5HM3WsViRLHXWiCwWC9v8LVC0bKvHBxDqb-nFi-zSHjc5cYTkuZQ9ewmrseIgGaPg"),

            new CreateVehicleRequest(
                "Mercedes-Benz", "AMG GT 63 S", 2023, 158900, 1200, "Automatic", "V8 Biturbo",
                luxury.RowKey,
                "El AMG GT 63 S combina lujo y rendimiento extremo. Solo 1.200 km.",
                "https://lh3.googleusercontent.com/aida-public/AB6AXuC4yyetjeKOHFljyzV3v-YtnorbPOxvXE_8cCfxXVZKsF_BlnPxjPYDlGXyutOEIi0hPwAV8ay_g3Cfu93mjjcNZ4yy9WS5ul38gf9beZBQ-62BEcYV1cbmUHD2nBaD0J1JKWtNhwOPeMy5kVNy2LLb1ci2qoZs8Tf6fLggseIDEPtN9haQ8Q5Y-jXCQwV7n3nE0z0mXErlTrffu6gORnvGnA5InZYoUbUVFmdtAeIEEOwdlvHXROVZjfx_MdRQ7XckENojZHghklE"),

            new CreateVehicleRequest(
                "Porsche", "911 GT3 RS", 2023, 245000, 500, "PDK 7-Speed", "Gasoline",
                apex.RowKey,
                "El 911 GT3 RS es la versión más extrema de la calle. Listo para pista.",
                "https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=2070&auto=format&fit=crop"),

            new CreateVehicleRequest(
                "Chevrolet", "Corvette Z06", 2023, 115000, 2100, "DCT 8-Speed", "V8 LT6",
                luxury.RowKey,
                "El Corvette Z06 con motor V8 LT6 de 670 CV. Pura emoción americana.",
                "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?q=80&w=2070&auto=format&fit=crop"),

            new CreateVehicleRequest(
                "BMW", "M4 Competition", 2022, 98500, 12000, "xDrive M-Steptronic", "I6 Twin Turbo",
                luxury.RowKey,
                "BMW M4 Competition xDrive, la berlina deportiva definitiva con tracción integral.",
                "https://images.unsplash.com/photo-1544636331-e26879cd4d9b?q=80&w=2070&auto=format&fit=crop"),

            new CreateVehicleRequest(
                "Audi", "RS e-tron GT", 2024, 142200, 0, "Single-Speed", "Electric",
                apex.RowKey,
                "El Audi RS e-tron GT es el futuro del rendimiento. 0 km, entrega inmediata.",
                "https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?q=80&w=2070&auto=format&fit=crop"),
        };

        foreach (var v in seedVehicles)
            await vehicleService.CreateAsync(v);

        return new OkObjectResult(new
        {
            message = "Datos de prueba creados exitosamente.",
            dealerships = new[] { dealershipService.ToDto(apex), dealershipService.ToDto(luxury) },
            vehiclesCreated = seedVehicles.Length
        });
    }

    [Function("ClearData")]
    public async Task<IActionResult> ClearData(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "seed/clear")] HttpRequest req)
    {
        if (Environment.GetEnvironmentVariable("AZURE_FUNCTIONS_ENVIRONMENT") != "Development")
            return new ForbidResult();

        var vehicles = (await vehicleService.GetAllAsync()).ToList();
        foreach (var v in vehicles)
            await vehicleService.DeleteAsync(v.PartitionKey, v.RowKey);

        var dealershipCount = await dealershipService.DeleteAllAsync();

        return new OkObjectResult(new { message = $"Se eliminaron {vehicles.Count} veh\u00edculos y {dealershipCount} automotoras." });
    }
}
