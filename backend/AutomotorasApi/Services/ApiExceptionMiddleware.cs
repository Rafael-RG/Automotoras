using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Middleware;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace AutomotorasApi.Services;

/// <summary>
/// Keeps expected client errors out of the Functions host's generic 500 response
/// without exposing exception details. Individual functions can still catch an
/// exception when their protocol needs a specialised response (for example a
/// payment webhook retry).
/// </summary>
public sealed class ApiExceptionMiddleware(ILogger<ApiExceptionMiddleware> logger) : IFunctionsWorkerMiddleware
{
    public async Task Invoke(FunctionContext context, FunctionExecutionDelegate next)
    {
        try
        {
            await next(context);
        }
        catch (ApiException exception)
        {
            await WriteErrorAsync(context, exception.StatusCode, exception.Code, exception.Message);
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Unhandled error while executing function {FunctionName}.",
                context.FunctionDefinition.Name);
            await WriteErrorAsync(context, 500, "internal_error", "No se pudo completar la solicitud.");
        }
    }

    private static async Task WriteErrorAsync(FunctionContext context, int statusCode, string code, string message)
    {
        // The app uses ASP.NET Core HTTP integration and returns IActionResult.
        // Setting an HttpResponseData here serializes the body but the integration
        // adapter keeps the original 200 status. Set an IActionResult instead so
        // Azure Functions preserves the intended HTTP status code.
        var request = await context.GetHttpRequestDataAsync();
        if (request is null)
            throw new InvalidOperationException("An error response can only be created for an HTTP function.");

        context.GetInvocationResult().Value = new ObjectResult(new { code, error = message })
        {
            StatusCode = statusCode,
        };
    }
}
