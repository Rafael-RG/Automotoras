using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;
using Microsoft.Extensions.Configuration;

namespace AutomotorasApi.Services;

public class EmailService(IConfiguration config)
{
    private readonly string _host = config["Smtp:Host"] ?? "smtp.hostinger.com";
    private readonly int _port = int.Parse(config["Smtp:Port"] ?? "587");
    private readonly string _user = config["Smtp:User"] ?? "";
    private readonly string _pass = config["Smtp:Password"] ?? "";
    private readonly string _fromName = "RedAutos";
    private readonly string _frontendUrl = config["FrontendUrl"] ?? "https://redautos.com.uy";

    public async Task SendVerificationEmailAsync(string toEmail, string toName, string token)
    {
        var link = $"{_frontendUrl}/verificar-email?token={Uri.EscapeDataString(token)}";
        var body = BuildEmailTemplate(
            title: "Verificá tu email",
            preheader: "Confirmá tu dirección para activar tu cuenta en RedAutos.",
            iconEmoji: "✉️",
            bodyHtml: $@"
              <p style=""margin:0 0 12px 0;font-size:16px;color:#cccccc;"">Hola <strong style=""color:#ffffff;"">{toName}</strong>,</p>
              <p style=""margin:0 0 24px 0;font-size:15px;color:#aaaaaa;line-height:1.6;"">
                Gracias por registrarte en <strong style=""color:#E5E2E3;"">RedAutos</strong>. Para activar tu cuenta necesitamos confirmar tu dirección de email.
              </p>
              <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0""><tr><td align=""center"" style=""padding:8px 0 28px 0;"">
                <a href=""{link}"" style=""display:inline-block;background:#D32F2F;color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:8px;font-size:16px;font-weight:700;letter-spacing:0.3px;"">Activar cuenta</a>
              </td></tr></table>
              <p style=""margin:0 0 8px 0;font-size:13px;color:#888888;"">Este enlace expira en <strong style=""color:#aaaaaa;"">24 horas</strong>. Si no creaste una cuenta en RedAutos, podés ignorar este mensaje.</p>",
            footerNote: $"O copiá este enlace en tu navegador: <a href=\"{link}\" style=\"color:#D32F2F;word-break:break-all;\">{link}</a>"
        );
        await SendAsync(toEmail, toName, "Verificá tu email en RedAutos", body);
    }

    public async Task SendPasswordResetEmailAsync(string toEmail, string toName, string token)
    {
        var link = $"{_frontendUrl}/reset-password?token={Uri.EscapeDataString(token)}";
        var body = BuildEmailTemplate(
            title: "Recuperar contraseña",
            preheader: "Recibimos una solicitud para restablecer tu contraseña de RedAutos.",
            iconEmoji: "🔒",
            bodyHtml: $@"
              <p style=""margin:0 0 12px 0;font-size:16px;color:#cccccc;"">Hola <strong style=""color:#ffffff;"">{toName}</strong>,</p>
              <p style=""margin:0 0 24px 0;font-size:15px;color:#aaaaaa;line-height:1.6;"">
                Recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong style=""color:#E5E2E3;"">RedAutos</strong>. Hacé click en el botón para elegir una nueva.
              </p>
              <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0""><tr><td align=""center"" style=""padding:8px 0 28px 0;"">
                <a href=""{link}"" style=""display:inline-block;background:#D32F2F;color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:8px;font-size:16px;font-weight:700;letter-spacing:0.3px;"">Restablecer contraseña</a>
              </td></tr></table>
              <p style=""margin:0 0 8px 0;font-size:13px;color:#888888;"">Este enlace expira en <strong style=""color:#aaaaaa;"">1 hora</strong>. Si no solicitaste esto, podés ignorar este mensaje: tu contraseña no fue modificada.</p>",
            footerNote: $"O copiá este enlace en tu navegador: <a href=\"{link}\" style=\"color:#D32F2F;word-break:break-all;\">{link}</a>"
        );
        await SendAsync(toEmail, toName, "Recuperar contraseña - RedAutos", body);
    }

    private string BuildEmailTemplate(string title, string preheader, string iconEmoji, string bodyHtml, string footerNote)
    {
        return $@"<!DOCTYPE html>
<html lang=""es"">
<head>
  <meta charset=""UTF-8"" />
  <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"" />
  <title>{title}</title>
</head>
<body style=""margin:0;padding:0;background-color:#111111;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"">
  <!-- preheader invisible -->
  <span style=""display:none;max-height:0;overflow:hidden;mso-hide:all;"">{preheader}</span>

  <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"" style=""background-color:#111111;"">
    <tr><td align=""center"" style=""padding:40px 16px;"">

      <!-- Card -->
      <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"" style=""max-width:560px;"">

        <!-- Header rojo -->
        <tr>
          <td style=""background:#D32F2F;border-radius:12px 12px 0 0;padding:28px 32px;text-align:center;"">
            <img src=""https://redautos.com.uy/Logo.png"" alt=""RedAutos"" height=""52"" style=""display:block;margin:0 auto;height:52px;"" />
          </td>
        </tr>

        <!-- Cuerpo -->
        <tr>
          <td style=""background:#1A1A1A;padding:36px 36px 28px 36px;border-left:1px solid #2a2a2a;border-right:1px solid #2a2a2a;"">

            <!-- Ícono + título -->
            <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"">
              <tr>
                <td style=""padding-bottom:24px;"">
                  <div style=""font-size:32px;margin-bottom:8px;"">{iconEmoji}</div>
                  <h1 style=""margin:0;font-size:22px;font-weight:700;color:#ffffff;"">{title}</h1>
                </td>
              </tr>
            </table>

            <!-- Contenido dinámico -->
            {bodyHtml}

            <!-- Separador -->
            <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0""><tr>
              <td style=""border-top:1px solid #2e2e2e;padding-top:20px;"">
                <p style=""margin:0;font-size:12px;color:#555555;line-height:1.6;"">{footerNote}</p>
              </td>
            </tr></table>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style=""background:#141414;border-radius:0 0 12px 12px;border:1px solid #2a2a2a;border-top:none;padding:20px 32px;text-align:center;"">
            <p style=""margin:0 0 4px 0;font-size:12px;color:#555555;"">© 2025 RedAutos · Uruguay</p>
            <p style=""margin:0;font-size:12px;"">
              <a href=""https://redautos.com.uy"" style=""color:#D32F2F;text-decoration:none;"">redautos.com.uy</a>
            </p>
          </td>
        </tr>

      </table>
      <!-- /Card -->

    </td></tr>
  </table>
</body>
</html>";
    }

    private async Task SendAsync(string toEmail, string toName, string subject, string htmlBody)
    {
        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(_fromName, _user));
        message.To.Add(new MailboxAddress(toName, toEmail));
        message.Subject = subject;
        message.Body = new TextPart(MimeKit.Text.TextFormat.Html) { Text = htmlBody };

        using var client = new SmtpClient();
        await client.ConnectAsync(_host, _port, SecureSocketOptions.SslOnConnect);
        await client.AuthenticateAsync(_user, _pass);
        await client.SendAsync(message);
        await client.DisconnectAsync(true);
    }
}
