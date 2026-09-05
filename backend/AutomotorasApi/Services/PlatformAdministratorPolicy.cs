using System.Net.Mail;
using Microsoft.Extensions.Configuration;

namespace AutomotorasApi.Services;

/// <summary>Server configuration is the sole source of platform-admin roles.</summary>
public static class PlatformAdministratorPolicy
{
    public static HashSet<string> ReadConfiguredEmails(IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        var configured = configuration["PlatformAdmin:Emails"] ?? configuration["PlatformAdminEmails"];
        var emails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(configured)) return emails;

        foreach (var candidate in configured.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (MailAddress.TryCreate(candidate, out var parsed) &&
                string.Equals(parsed.Address, candidate, StringComparison.OrdinalIgnoreCase))
            {
                emails.Add(parsed.Address);
            }
        }
        return emails;
    }

    public static bool IsConfigured(IConfiguration configuration, string? loginEmail) =>
        !string.IsNullOrWhiteSpace(loginEmail) &&
        ReadConfiguredEmails(configuration).Contains(loginEmail);
}
