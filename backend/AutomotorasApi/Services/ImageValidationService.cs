using System.Buffers.Binary;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Net.Http.Headers;

namespace AutomotorasApi.Services;

public sealed class ImageValidationService
{
    public const int MaxFileSize = 5 * 1024 * 1024;
    public const int MaxDimension = 8192;
    public const long MaxPixels = 40_000_000;
    private const long MaxMultipartSize = MaxFileSize + 64 * 1024;
    private readonly int _maxFileSize = MaxFileSize;

    public sealed record ValidatedImage(byte[] Bytes, string ContentType, int Width, int Height)
    {
        public MemoryStream OpenReadStream() => new(Bytes, writable: false);
    }

    // Call only AFTER authorizing the route's vehicle/dealership/admin.
    public Task<ValidatedImage> ReadUploadAsync(HttpRequest request) =>
        ReadMultipartSafelyAsync(() => ReadUploadCoreAsync(request));

    private async Task<ValidatedImage> ReadUploadCoreAsync(HttpRequest request)
    {
        var reader = CreateMultipartReader(request);
        var section = await reader.ReadNextSectionAsync(request.HttpContext.RequestAborted);
        if (section is null || !IsFileSection(section))
            throw InvalidImage("Se requiere un archivo en el campo 'file'.");
        var image = await ReadAndValidateAsync(section.Body, section.ContentType, request.HttpContext.RequestAborted);
        if (await reader.ReadNextSectionAsync(request.HttpContext.RequestAborted) is not null)
            throw InvalidImage("Enviá una sola imagen por solicitud.");
        return image;
    }

    // Stream the small tenant field first. Unlike ReadFormAsync, this does not buffer an
    // arbitrary uploaded file before checking ownership. No file section is read before authorization.
    public Task<(string DealershipId, ValidatedImage Image)> ReadTemporaryUploadAsync(
        HttpRequest request, Func<string, Task> authorizeDealership) =>
        ReadMultipartSafelyAsync(() => ReadTemporaryUploadCoreAsync(request, authorizeDealership));

    private async Task<(string DealershipId, ValidatedImage Image)> ReadTemporaryUploadCoreAsync(
        HttpRequest request, Func<string, Task> authorizeDealership)
    {
        var reader = CreateMultipartReader(request);
        var tenantSection = await reader.ReadNextSectionAsync(request.HttpContext.RequestAborted);
        if (tenantSection is null || !ContentDispositionHeaderValue.TryParse(tenantSection.ContentDisposition, out var disposition) ||
            !string.Equals(HeaderUtilities.RemoveQuotes(disposition.Name).Value, "dealershipId", StringComparison.Ordinal) ||
            disposition.FileName.HasValue || disposition.FileNameStar.HasValue)
            throw InvalidImage("Enviá el campo 'dealershipId' antes del archivo 'file'.");

        var tenantBytes = await ReadLimitedAsync(tenantSection.Body, 512, request.HttpContext.RequestAborted);
        var dealershipId = Encoding.UTF8.GetString(tenantBytes).Trim();
        VehicleStorageService.ValidateKey(dealershipId, "Automotora");
        await authorizeDealership(dealershipId);

        var fileSection = await reader.ReadNextSectionAsync(request.HttpContext.RequestAborted);
        if (fileSection is null || !IsFileSection(fileSection))
            throw InvalidImage("Se requiere un archivo en el campo 'file'.");
        var image = await ReadAndValidateAsync(fileSection.Body, fileSection.ContentType, request.HttpContext.RequestAborted);
        if (await reader.ReadNextSectionAsync(request.HttpContext.RequestAborted) is not null)
            throw InvalidImage("Enviá una sola imagen por solicitud.");
        return (dealershipId, image);
    }

    private static async Task<T> ReadMultipartSafelyAsync<T>(Func<Task<T>> read)
    {
        try
        {
            return await read();
        }
        catch (InvalidDataException)
        {
            throw InvalidImage("El formulario está incompleto, no es válido o supera los límites permitidos.");
        }
        catch (IOException)
        {
            throw InvalidImage("No se pudo leer el formulario completo. Volvé a enviar la imagen.");
        }
    }

    public async Task<ValidatedImage> ReadAndValidateAsync(Stream stream, string? contentType, CancellationToken cancellationToken = default)
    {
        var normalizedType = NormalizeContentType(contentType);
        var bytes = await ReadLimitedAsync(stream, _maxFileSize, cancellationToken);
        return Validate(bytes, normalizedType);
    }

    // Bounded structural/header validation, NOT a pixel decoder or sanitizer. A maintained
    // cross-platform decoder is required if full decoding/re-encoding or EXIF removal is desired.
    public static ValidatedImage Validate(byte[] bytes, string? contentType)
    {
        if (bytes.Length == 0) throw InvalidImage("La imagen está vacía.");
        if (bytes.Length > MaxFileSize) throw TooLarge();
        var type = NormalizeContentType(contentType);
        var dimensions = type switch
        {
            "image/png" => ReadPngDimensions(bytes),
            "image/jpeg" => ReadJpegDimensions(bytes),
            "image/webp" => ReadWebpDimensions(bytes),
            _ => throw InvalidImage("Solo se permiten imágenes JPEG, PNG o WebP.")
        };
        var (width, height) = dimensions;
        if (width <= 0 || height <= 0 || width > MaxDimension || height > MaxDimension || (long)width * height > MaxPixels)
            throw InvalidImage($"Las dimensiones no son válidas: máximo {MaxDimension} píxeles por lado y 40 megapíxeles.");
        return new ValidatedImage(bytes, type, width, height);
    }

    private static MultipartReader CreateMultipartReader(HttpRequest request)
    {
        if (request.ContentLength > MaxMultipartSize) throw TooLarge();
        if (!MediaTypeHeaderValue.TryParse(request.ContentType, out var type) ||
            !string.Equals(type.MediaType.Value, "multipart/form-data", StringComparison.OrdinalIgnoreCase))
            throw InvalidImage("Se requiere un formulario multipart/form-data.");
        var boundary = HeaderUtilities.RemoveQuotes(type.Boundary).Value;
        if (string.IsNullOrEmpty(boundary) || boundary.Length > 128)
            throw InvalidImage("El delimitador del formulario no es válido.");
        return new MultipartReader(boundary, request.Body)
        {
            HeadersCountLimit = 8,
            HeadersLengthLimit = 8192,
            BodyLengthLimit = MaxFileSize + 1L
        };
    }

    private static bool IsFileSection(MultipartSection section) =>
        ContentDispositionHeaderValue.TryParse(section.ContentDisposition, out var disposition) &&
        string.Equals(disposition.DispositionType.Value, "form-data", StringComparison.OrdinalIgnoreCase) &&
        string.Equals(HeaderUtilities.RemoveQuotes(disposition.Name).Value, "file", StringComparison.Ordinal) &&
        (disposition.FileName.HasValue || disposition.FileNameStar.HasValue);

    private static async Task<byte[]> ReadLimitedAsync(Stream source, int limit, CancellationToken cancellationToken)
    {
        using var output = new MemoryStream();
        var buffer = new byte[8192];
        while (true)
        {
            // Read at most one byte beyond the limit, including streams without a Length.
            var count = (int)Math.Min(buffer.Length, limit + 1L - output.Length);
            var read = await source.ReadAsync(buffer.AsMemory(0, count), cancellationToken);
            if (read == 0) return output.ToArray();
            if (output.Length + read > limit) throw TooLarge();
            await output.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
        }
    }

    private static (int Width, int Height) ReadPngDimensions(ReadOnlySpan<byte> data)
    {
        if (data.Length < 45 || !data[..8].SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }) ||
            BinaryPrimitives.ReadUInt32BigEndian(data.Slice(8, 4)) != 13 || !data.Slice(12, 4).SequenceEqual("IHDR"u8))
            throw InvalidImage("El contenido no es un PNG válido.");
        var width = BinaryPrimitives.ReadUInt32BigEndian(data.Slice(16, 4));
        var height = BinaryPrimitives.ReadUInt32BigEndian(data.Slice(20, 4));
        if (width > MaxDimension || height > MaxDimension || data[26] != 0 || data[27] != 0 || data[28] > 1 ||
            !ValidPngDepth(data[24], data[25]))
            throw InvalidImage("La cabecera PNG o sus dimensiones no son válidas.");

        ValidatePngChunks(data);
        return ((int)width, (int)height);
    }

    private static void ValidatePngChunks(ReadOnlySpan<byte> data)
    {
        var offset = 8;
        var hasData = false;
        while (offset <= data.Length - 12)
        {
            var length = BinaryPrimitives.ReadUInt32BigEndian(data.Slice(offset, 4));
            if (length > (uint)(data.Length - offset - 12)) break;
            var chunkType = data.Slice(offset + 4, 4);
            if (chunkType.SequenceEqual("IDAT"u8) && length > 0) hasData = true;
            if (chunkType.SequenceEqual("IEND"u8))
            {
                if (!hasData || length != 0 || offset + 12 != data.Length) break;
                return;
            }
            offset += (int)length + 12;
        }
        throw InvalidImage("El PNG está truncado o no contiene datos de imagen.");
    }

    private static bool ValidPngDepth(byte depth, byte color) => color switch
    {
        0 => depth is 1 or 2 or 4 or 8 or 16,
        2 or 4 or 6 => depth is 8 or 16,
        3 => depth is 1 or 2 or 4 or 8,
        _ => false
    };

    private static (int Width, int Height) ReadJpegDimensions(ReadOnlySpan<byte> data)
    {
        if (data.Length < 20 || data[0] != 0xff || data[1] != 0xd8 || data[^2] != 0xff || data[^1] != 0xd9)
            throw InvalidImage("El contenido no es un JPEG válido o está truncado.");
        var offset = 2;
        (int Width, int Height) dimensions = default;
        while (offset < data.Length - 2)
        {
            var (marker, length) = ReadJpegSegment(data, ref offset);
            if (marker is 0xc0 or 0xc1 or 0xc2)
                dimensions = ReadJpegFrame(data.Slice(offset, length));
            if (marker == 0xda)
            {
                if (dimensions.Width == 0 || length < 6 || offset + length >= data.Length - 2) break;
                return dimensions;
            }
            offset += length;
        }
        throw InvalidImage("El JPEG no contiene una cabecera y datos de imagen compatibles.");
    }

    private static (byte Marker, int Length) ReadJpegSegment(ReadOnlySpan<byte> data, ref int offset)
    {
        if (data[offset++] != 0xff) throw InvalidImage("El JPEG contiene un marcador inválido.");
        while (offset < data.Length && data[offset] == 0xff) offset++;
        if (offset >= data.Length) throw InvalidImage("El JPEG está truncado.");
        var marker = data[offset++];
        if (marker is 0 or 0xd8 or 0xd9 || offset > data.Length - 2)
            throw InvalidImage("El JPEG contiene un marcador inválido.");
        var length = BinaryPrimitives.ReadUInt16BigEndian(data.Slice(offset, 2));
        if (length < 2 || length > data.Length - offset) throw InvalidImage("El JPEG está truncado.");
        return (marker, length);
    }

    private static (int Width, int Height) ReadJpegFrame(ReadOnlySpan<byte> frame)
    {
        if (frame.Length < 11 || frame[2] != 8 || frame[7] is not (1 or 3 or 4) || frame.Length != 8 + 3 * frame[7])
            throw InvalidImage("La cabecera JPEG no es compatible.");
        return (BinaryPrimitives.ReadUInt16BigEndian(frame.Slice(5, 2)), BinaryPrimitives.ReadUInt16BigEndian(frame.Slice(3, 2)));
    }

    private static (int Width, int Height) ReadWebpDimensions(ReadOnlySpan<byte> data)
    {
        if (data.Length < 26 || !data[..4].SequenceEqual("RIFF"u8) || !data.Slice(8, 4).SequenceEqual("WEBP"u8) ||
            BinaryPrimitives.ReadUInt32LittleEndian(data.Slice(4, 4)) != data.Length - 8)
            throw InvalidImage("El contenido no es un WebP válido o está truncado.");
        var offset = 12;
        (int Width, int Height) dimensions = default;
        var hasFrame = false;
        while (offset <= data.Length - 8)
        {
            var size = BinaryPrimitives.ReadUInt32LittleEndian(data.Slice(offset + 4, 4));
            if (size > (uint)(data.Length - offset - 8)) break;
            var type = data.Slice(offset, 4);
            var payload = data.Slice(offset + 8, (int)size);
            ReadWebpChunk(type, payload, offset, ref dimensions, ref hasFrame);
            offset += 8 + (int)size + ((int)size & 1);
            if (offset == data.Length && hasFrame) return dimensions;
        }
        throw InvalidImage("El WebP no contiene una imagen estática compatible.");
    }

    private static void ReadWebpChunk(ReadOnlySpan<byte> type, ReadOnlySpan<byte> payload, int offset,
        ref (int Width, int Height) dimensions, ref bool hasFrame)
    {
        if (type.SequenceEqual("VP8X"u8))
        {
            if (offset != 12) throw InvalidImage("La cabecera extendida WebP debe ser el primer bloque.");
            dimensions = ReadExtendedWebpFrame(payload);
            return;
        }
        if (type.SequenceEqual("VP8 "u8) || type.SequenceEqual("VP8L"u8))
        {
            var frame = ReadWebpFrame(payload, type.SequenceEqual("VP8L"u8));
            if (hasFrame || (dimensions.Width != 0 && dimensions != frame))
                throw InvalidImage("Las dimensiones de los bloques WebP no coinciden.");
            dimensions = frame;
            hasFrame = true;
            return;
        }
        RejectAnimatedWebpChunk(type);
    }

    private static (int Width, int Height) ReadExtendedWebpFrame(ReadOnlySpan<byte> payload)
    {
        if (payload.Length != 10 || (payload[0] & 0xc3) != 0 || payload[1] != 0 || payload[2] != 0 || payload[3] != 0)
            throw InvalidImage("La cabecera WebP extendida no es compatible; no se admiten animaciones.");
        return (ReadUInt24(payload.Slice(4, 3)) + 1, ReadUInt24(payload.Slice(7, 3)) + 1);
    }

    private static void RejectAnimatedWebpChunk(ReadOnlySpan<byte> type)
    {
        if (type.SequenceEqual("ANIM"u8) || type.SequenceEqual("ANMF"u8))
            throw InvalidImage("No se admiten imágenes WebP animadas.");
    }

    private static (int Width, int Height) ReadWebpFrame(ReadOnlySpan<byte> payload, bool lossless)
    {
        if (lossless)
        {
            if (payload.Length <= 5 || payload[0] != 0x2f || (payload[4] & 0xe0) != 0)
                throw InvalidImage("La cabecera WebP sin pérdida no es válida.");
            var bits = BinaryPrimitives.ReadUInt32LittleEndian(payload.Slice(1, 4));
            return ((int)(bits & 0x3fff) + 1, (int)((bits >> 14) & 0x3fff) + 1);
        }
        if (payload.Length <= 10 || (payload[0] & 1) != 0 || !payload.Slice(3, 3).SequenceEqual(new byte[] { 0x9d, 0x01, 0x2a }))
            throw InvalidImage("La cabecera WebP no es válida.");
        return (BinaryPrimitives.ReadUInt16LittleEndian(payload.Slice(6, 2)) & 0x3fff,
            BinaryPrimitives.ReadUInt16LittleEndian(payload.Slice(8, 2)) & 0x3fff);
    }

    private static int ReadUInt24(ReadOnlySpan<byte> bytes) => bytes[0] | (bytes[1] << 8) | (bytes[2] << 16);

    private static string NormalizeContentType(string? contentType)
    {
        var type = contentType?.Trim().ToLowerInvariant();
        if (type is not ("image/jpeg" or "image/png" or "image/webp"))
            throw InvalidImage("Solo se permiten imágenes JPEG, PNG o WebP.");
        return type;
    }

    private static ApiException InvalidImage(string message) => new(400, "invalid_image", message);
    private static ApiException TooLarge() => new(413, "image_too_large", "El archivo supera el límite de 5 MB.");
}