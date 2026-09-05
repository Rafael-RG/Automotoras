using AutomotorasApi.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Azure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var host = new HostBuilder()
    .ConfigureFunctionsWebApplication(worker =>
    {
        worker.UseMiddleware<ApiExceptionMiddleware>();
    })
    .ConfigureServices((context, services) =>
    {
        var allowedOrigins = GetAllowedOrigins(context.Configuration);
        services.AddCors(options =>
        {
            // Azure Functions' platform CORS configuration remains required in
            // production. This policy covers ASP.NET Core-integrated hosting and
            // deliberately has no permissive fallback when configuration is bad.
            if (allowedOrigins.Length == 0) return;
            options.AddDefaultPolicy(policy => policy
                .WithOrigins(allowedOrigins)
                .AllowAnyMethod()
                .AllowAnyHeader()
                .AllowCredentials());
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
        services.AddSingleton<SubscriptionReconciliationService>();
        services.AddSingleton<EmailService>();
        services.AddSingleton<AdStorageService>();
        services.AddSingleton<ImageValidationService>();
        services.AddSingleton<SessionStorageService>();
        services.AddSingleton<IRequestAuthorizer, RequestAuthorizer>();
    })
    .Build();

host.Run();

static string[] GetAllowedOrigins(IConfiguration configuration) =>
    TrustedOriginPolicy.ReadAllowedOrigins(configuration);
