using AutomotorasApi.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Azure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var host = new HostBuilder()
    .ConfigureFunctionsWebApplication()
    .ConfigureServices((context, services) =>
    {
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
    })
    .Build();

host.Run();
