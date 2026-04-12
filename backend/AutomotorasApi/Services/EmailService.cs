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
        var body = $@"
<div style='font-family:sans-serif;max-width:580px;margin:0 auto;background:#0E0E0F;color:#E5E2E3;padding:32px;border-radius:12px;'>
  <img src='https://redautos.com.uy/logo.png' alt='RedAutos' style='height:48px;margin-bottom:24px;' />
  <h2 style='color:#ffffff;margin-top:0;'>Verificá tu email</h2>
  <p>Hola <strong>{toName}</strong>, gracias por registrarte en RedAutos.</p>
  <p>Hacé click en el botón para confirmar tu dirección de email y activar tu cuenta:</p>
  <a href='{link}' style='display:inline-block;background:#D32F2F;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;margin:16px 0;'>Verificar email</a>
  <p style='font-size:12px;color:#888;'>Este link expira en 24 horas. Si no creaste una cuenta en RedAutos, ignorá este mensaje.</p>
  <p style='font-size:12px;color:#888;'>O copiá este enlace: {link}</p>
</div>";

        await SendAsync(toEmail, toName, "Verificá tu email en RedAutos", body);
    }

    public async Task SendPasswordResetEmailAsync(string toEmail, string toName, string token)
    {
        var link = $"{_frontendUrl}/reset-password?token={Uri.EscapeDataString(token)}";
        var body = $@"
<div style='font-family:sans-serif;max-width:580px;margin:0 auto;background:#0E0E0F;color:#E5E2E3;padding:32px;border-radius:12px;'>
  <img src='https://redautos.com.uy/logo.png' alt='RedAutos' style='height:48px;margin-bottom:24px;' />
  <h2 style='color:#ffffff;margin-top:0;'>Recuperar contraseña</h2>
  <p>Hola <strong>{toName}</strong>, recibimos una solicitud para restablecer tu contraseña.</p>
  <p>Hacé click en el botón para elegir una nueva contraseña:</p>
  <a href='{link}' style='display:inline-block;background:#D32F2F;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;margin:16px 0;'>Restablecer contraseña</a>
  <p style='font-size:12px;color:#888;'>Este link expira en 1 hora. Si no solicitaste esto, ignorá este mensaje.</p>
  <p style='font-size:12px;color:#888;'>O copiá este enlace: {link}</p>
</div>";

        await SendAsync(toEmail, toName, "Recuperar contraseña - RedAutos", body);
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
