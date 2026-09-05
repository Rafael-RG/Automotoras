namespace AutomotorasApi.Services;

/// <summary>
/// An expected, client-safe API error.  Function middleware turns this into the
/// documented JSON error shape and deliberately does not include an inner
/// exception or any storage/provider detail in the response.
/// </summary>
public sealed class ApiException : Exception
{
    public ApiException(int statusCode, string code, string message)
        : base(message)
    {
        StatusCode = statusCode;
        Code = code;
    }

    public ApiException(int statusCode, string code, string message, Exception innerException)
        : base(message, innerException)
    {
        StatusCode = statusCode;
        Code = code;
    }

    public int StatusCode { get; }

    /// <summary>A stable, machine-readable error code; never put secrets in it.</summary>
    public string Code { get; }
}
