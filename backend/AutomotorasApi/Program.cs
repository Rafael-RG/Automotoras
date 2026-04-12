using AutomotorasApi.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Azure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var host = new HostBuilder()
    .ConfigureFunctionsWebApplication()
    .ConfigureServices((context, services) =>
    {
        services.AddCors(options =>
        {
            options.AddDefaultPolicy(policy =>
            {
                policy
                    .WithOrigins(
                        "http://localhost:3000",
                        "https://orangered-deer-311677.hostingersite.com",
                        "https://redautos.com.uy"
                    )
                    .AllowAnyMethod()
                    .AllowAnyHeader();
            });
        });
        var connectionString = context.Configuration["AzureWebJobsStorage"]
            ?? "UseDevelopmentStorage=true";

        services.AddAzureClients(builder =>
        {
            builder.AddTableServiceClient(connectionString);
            builder.AddBlobServiceClient(connectionString);
        });

        services.AddSingleton<VehicleStorageService>();
        services.AddSingleton<DealershipStorageService>();
        services.AddSingleton<BlobStorageService>();
        services.AddSingleton<SubscriptionService>();
        services.AddSingleton<EmailService>();
    })
    .Build();

host.Run();
