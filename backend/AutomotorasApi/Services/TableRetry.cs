using Azure;

namespace AutomotorasApi.Services;

public static class TableRetry
{
    public const int MaxAttempts = 3;

    // The operation must fetch a fresh entity (and ETag) on every invocation.
    public static async Task<T> OnPreconditionFailedAsync<T>(Func<Task<T>> operation)
    {
        for (var attempt = 1; attempt <= MaxAttempts; attempt++)
        {
            try
            {
                return await operation();
            }
            catch (RequestFailedException ex) when (ex.Status == 412)
            {
                if (attempt == MaxAttempts)
                    throw Conflict();
            }
        }

        throw Conflict();
    }

    public static ApiException Conflict() => new(409, "concurrent_update",
        "El registro cambió mientras se guardaba. Actualizá los datos y volvé a intentarlo.");
}