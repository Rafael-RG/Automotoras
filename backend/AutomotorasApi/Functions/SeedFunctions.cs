using AutomotorasApi.Models;
using AutomotorasApi.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using System.Linq;

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
                Brand: "Porsche", Model: "911 Carrera S", Year: 2022, Price: 132500, Mileage: 8400,
                Transmission: "PDK 8-Speed", Fuel: "Gasoline", BodyType: "Coupé",
                DealershipId: apex.RowKey,
                Description: "Porsche 911 Carrera S en estado impecable. Un ícono de la ingeniería alemana.",
                ImageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuCOMbAZQgMf0QYqRi-TWzuu-0S06hRccKupQavtyC1E_61NdVLcUlGHNDjej0783zwcy3taLC17vUtumi7XRaKJsG-UL5fbVuXB1I7uIuY-zOglAhMKFZpabKWw-W2A2ipVggA07g1Pvnp2gynlt9Y9YK4N0DGA5Gq2x-OEli5w3p_cq2AktcA0H4vNsEGw16rw8pWr3rN6Qe5HM3WsViRLHXWiCwWC9v8LVC0bKvHBxDqb-nFi-zSHjc5cYTkuZQ9ewmrseIgGaPg",
                ImageUrls: new[] {
                    "https://lh3.googleusercontent.com/aida-public/AB6AXuCOMbAZQgMf0QYqRi-TWzuu-0S06hRccKupQavtyC1E_61NdVLcUlGHNDjej0783zwcy3taLC17vUtumi7XRaKJsG-UL5fbVuXB1I7uIuY-zOglAhMKFZpabKWw-W2A2ipVggA07g1Pvnp2gynlt9Y9YK4N0DGA5Gq2x-OEli5w3p_cq2AktcA0H4vNsEGw16rw8pWr3rN6Qe5HM3WsViRLHXWiCwWC9v8LVC0bKvHBxDqb-nFi-zSHjc5cYTkuZQ9ewmrseIgGaPg",
                    "https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=2070&auto=format&fit=crop",
                    "https://images.unsplash.com/photo-1544636331-e26879cd4d9b?q=80&w=2074&auto=format&fit=crop",
                    "https://images.unsplash.com/photo-1584345604476-8ec5e12e42dd?q=80&w=2070&auto=format&fit=crop",
                    "https://images.unsplash.com/photo-1611821064430-0d40291d0f0b?q=80&w=2073&auto=format&fit=crop"
                },
                Color: "Plata GT", Doors: 2, Engine: "3.0L 450 CV Biturbo",
                Matricula: "POR-001-STU", Padron: "PAD-2022-9110"),

            new CreateVehicleRequest(
                Brand: "Mercedes-Benz", Model: "AMG GT 63 S", Year: 2023, Price: 158900, Mileage: 1200,
                Transmission: "Automático 9G-Tronic", Fuel: "Nafta", BodyType: "Sedán",
                DealershipId: luxury.RowKey,
                Description: "El AMG GT 63 S combina lujo y rendimiento extremo. Solo 1.200 km.",
                ImageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuC4yyetjeKOHFljyzV3v-YtnorbPOxvXE_8cCfxXVZKsF_BlnPxjPYDlGXyutOEIi0hPwAV8ay_g3Cfu93mjjcNZ4yy9WS5ul38gf9beZBQ-62BEcYV1cbmUHD2nBaD0J1JKWtNhwOPeMy5kVNy2LLb1ci2qoZs8Tf6fLggseIDEPtN9haQ8Q5Y-jXCQwV7n3nE0z0mXErlTrffu6gORnvGnA5InZYoUbUVFmdtAeIEEOwdlvHXROVZjfx_MdRQ7XckENojZHghklE",
                Color: "Negro Obsidiana", Doors: 4, Engine: "4.0L V8 Biturbo 639 CV",
                Matricula: "AMG-063-MAD", Padron: "PAD-2023-6300"),

            new CreateVehicleRequest(
                Brand: "Porsche", Model: "911 GT3 RS", Year: 2023, Price: 245000, Mileage: 500,
                Transmission: "PDK 7-Speed", Fuel: "Gasoline", BodyType: "Coupé",
                DealershipId: apex.RowKey,
                Description: "El 911 GT3 RS es la versión más extrema de la calle. Listo para pista.",
                ImageUrl: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=2070&auto=format&fit=crop",
                Color: "Blanco Carrara", Doors: 2, Engine: "4.0L 525 CV Atmosférico",
                Matricula: "GT3-RS-STU", Padron: "PAD-2023-9113"),

            new CreateVehicleRequest(
                Brand: "Chevrolet", Model: "Corvette Z06", Year: 2023, Price: 115000, Mileage: 2100,
                Transmission: "DCT 8-Speed", Fuel: "Nafta", BodyType: "Coupé",
                DealershipId: luxury.RowKey,
                Description: "El Corvette Z06 con motor V8 LT6 de 670 CV. Pura emoción americana.",
                ImageUrl: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?q=80&w=2070&auto=format&fit=crop",
                Color: "Rojo Torch", Doors: 2, Engine: "5.5L V8 LT6 670 CV",
                Matricula: "CVT-Z06-MAD", Padron: "PAD-2023-Z060"),

            new CreateVehicleRequest(
                Brand: "BMW", Model: "M4 Competition", Year: 2022, Price: 98500, Mileage: 12000,
                Transmission: "xDrive M-Steptronic", Fuel: "Nafta", BodyType: "Coupé",
                DealershipId: luxury.RowKey,
                Description: "BMW M4 Competition xDrive, la berlina deportiva definitiva con tracción integral.",
                ImageUrl: "https://images.unsplash.com/photo-1544636331-e26879cd4d9b?q=80&w=2070&auto=format&fit=crop",
                Color: "Azul Portimao", Doors: 2, Engine: "3.0L I6 Twin Turbo 530 CV",
                Matricula: "BMW-M4-MAD", Padron: "PAD-2022-M400", IsSold: true),

            new CreateVehicleRequest(
                Brand: "Audi", Model: "RS e-tron GT", Year: 2024, Price: 142200, Mileage: 0,
                Transmission: "Single-Speed", Fuel: "Eléctrico", BodyType: "Sedán",
                DealershipId: apex.RowKey,
                Description: "El Audi RS e-tron GT es el futuro del rendimiento. 0 km, entrega inmediata.",
                ImageUrl: "https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?q=80&w=2070&auto=format&fit=crop",
                Color: "Gris Daytona", Doors: 4, Engine: "Dual Motor 646 CV",
                Matricula: "AUD-RSE-STU", Padron: "PAD-2024-RSE0"),
        };

        var createdVehicles = new List<AutomotorasApi.Models.VehicleEntity>();
        foreach (var v in seedVehicles)
            createdVehicles.Add(await vehicleService.CreateAsync(v));

        // Simular actividad (vistas / leads / compartidos) en algunos vehículos de Apex
        var apexVehicles = createdVehicles.Where(v => v.DealershipId == apex.RowKey).ToList();
        if (apexVehicles.Count > 0)
        {
            var featured = apexVehicles[0]; // Porsche 911 Carrera S
            for (var i = 0; i < 42; i++)
                await vehicleService.IncrementEventAsync(featured.Brand, featured.RowKey, "view");
            for (var i = 0; i < 6; i++)
                await vehicleService.IncrementEventAsync(featured.Brand, featured.RowKey, "lead");
            for (var i = 0; i < 3; i++)
                await vehicleService.IncrementEventAsync(featured.Brand, featured.RowKey, "share");
        }
        if (apexVehicles.Count > 1)
        {
            var second = apexVehicles[1]; // Porsche 911 GT3 RS
            for (var i = 0; i < 15; i++)
                await vehicleService.IncrementEventAsync(second.Brand, second.RowKey, "view");
            for (var i = 0; i < 2; i++)
                await vehicleService.IncrementEventAsync(second.Brand, second.RowKey, "lead");
        }

        // Completar perfil de Apex (bio, redes, horario, logo)
        await dealershipService.UpdateAsync(apex.RowKey, new UpdateDealershipRequest(
            Name: apex.Name,
            Address: apex.Address,
            City: apex.City,
            Country: apex.Country,
            Phone: apex.Phone,
            Email: "admin@apexporsche.com",
            Latitude: apex.Latitude,
            Longitude: apex.Longitude,
            Bio: "Concesionario oficial especializado en Porsche de alto rendimiento. Más de 15 años ofreciendo vehículos deportivos certificados en Stuttgart.",
            BusinessHours: "Lun a Vie 09:00-18:00, Sáb 10:00-14:00",
            Instagram: "@apexporschestuttgart",
            TikTok: "@apexporsche",
            Website: "https://apexvelocity.de"));
        await dealershipService.UpdateLogoUrlAsync(
            apex.RowKey,
            "https://images.unsplash.com/photo-1617814076367-b759c7d7e738?q=80&w=400&auto=format&fit=crop");

        // Credenciales de prueba para Apex Porsche Stuttgart (con plan activo)
        await dealershipService.SetTestCredentialsAsync(
            apex.RowKey,
            "admin@apexporsche.com",
            "Test1234");
        await dealershipService.UpdatePlanAsync(apex.RowKey, "plus", "sim-seed-" + Guid.NewGuid(), "authorized");

        // Simular vistas de perfil de los últimos meses para Apex
        for (var i = 0; i < 27; i++)
            await dealershipService.TrackProfileVisitAsync(apex.RowKey);

        // Credenciales de prueba para Luxury Motors Madrid (sin plan activo, para probar el bloqueo por suscripción)
        await dealershipService.SetTestCredentialsAsync(
            luxury.RowKey,
            "admin@luxurymotors.es",
            "Test1234");

        // Releer de storage para devolver el estado final (no el objeto en memoria desactualizado)
        var apexFinal = await dealershipService.GetByIdAsync(apex.RowKey) ?? apex;
        var luxuryFinal = await dealershipService.GetByIdAsync(luxury.RowKey) ?? luxury;

        return new OkObjectResult(new
        {
            message = "Datos de prueba creados exitosamente.",
            dealerships = new[] { DealershipStorageService.ToDto(apexFinal), DealershipStorageService.ToDto(luxuryFinal) },
            vehiclesCreated = seedVehicles.Length,
            testCredentials = new[]
            {
                new { dealership = "Apex Porsche Stuttgart", email = "admin@apexporsche.com", password = "Test1234", subscriptionStatus = "authorized (plan plus)" },
                new { dealership = "Luxury Motors Madrid", email = "admin@luxurymotors.es", password = "Test1234", subscriptionStatus = "sin plan activo" }
            }
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
