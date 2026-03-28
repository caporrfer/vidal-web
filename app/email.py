import smtplib
import threading
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.config import SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, APP_URL

logger = logging.getLogger(__name__)

DAYS_ES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
             "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


def _format_date(date_str: str) -> str:
    """Convert YYYY-MM-DD to 'Lunes, 14 de marzo de 2025'."""
    from datetime import date
    try:
        d = date.fromisoformat(date_str)
        return f"{DAYS_ES[d.weekday()]}, {d.day} de {MONTHS_ES[d.month - 1]} de {d.year}"
    except Exception:
        return date_str


def _send_email_sync(to: str, subject: str, html_body: str):
    """Send email synchronously. Call from a thread."""
    if not SMTP_USER or not SMTP_PASSWORD:
        logger.warning("Email not configured (SMTP_USER/SMTP_PASSWORD missing). Skipping.")
        return
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_FROM or SMTP_USER
        msg["To"] = to
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_USER, [to], msg.as_string())
        logger.info("Email sent to %s", to)
    except Exception as e:
        logger.error("Failed to send email to %s: %s", to, e)


def send_email(to: str, subject: str, html_body: str):
    """Send email in a background thread (non-blocking)."""
    t = threading.Thread(target=_send_email_sync, args=(to, subject, html_body), daemon=True)
    t.start()


def send_booking_confirmation(appt: dict, service: dict):
    """Send booking confirmation email with edit/cancel links."""
    token = appt.get("token", "")
    edit_url = f"{APP_URL}/cita/{token}/editar"
    cancel_url = f"{APP_URL}/cita/{token}/cancelar"
    view_url = f"{APP_URL}/cita/{token}"
    date_fmt = _format_date(appt["date"])
    price_str = f"{service['price']:.0f}€" if service.get("price") else ""

    html = f"""
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#1a1a1a;font-family:Georgia,serif;color:#e8e0d0;">
<div style="max-width:560px;margin:0 auto;padding:32px 16px;">
  <div style="text-align:center;margin-bottom:32px;">
    <h1 style="color:#C9A14A;font-size:1.6rem;letter-spacing:0.15em;margin:0;">VIDAL BARBER</h1>
    <p style="color:#a09070;font-size:0.85rem;margin:4px 0 0;">Peluquería · Barbería · Estilo</p>
  </div>

  <div style="background:#242424;border:1px solid #3a3020;border-radius:8px;padding:28px;">
    <h2 style="color:#C9A14A;font-size:1.1rem;margin:0 0 20px;text-align:center;letter-spacing:0.08em;">
      ✓ CITA CONFIRMADA
    </h2>

    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:8px 0;color:#a09070;font-size:0.9rem;width:40%;">Servicio</td>
        <td style="padding:8px 0;font-weight:bold;">{service['name']}</td>
      </tr>
      <tr style="border-top:1px solid #333;">
        <td style="padding:8px 0;color:#a09070;font-size:0.9rem;">Fecha</td>
        <td style="padding:8px 0;">{date_fmt}</td>
      </tr>
      <tr style="border-top:1px solid #333;">
        <td style="padding:8px 0;color:#a09070;font-size:0.9rem;">Hora</td>
        <td style="padding:8px 0;">{appt['start_time']} – {appt['end_time']}</td>
      </tr>
      {"" if not price_str else f'<tr style="border-top:1px solid #333;"><td style="padding:8px 0;color:#a09070;font-size:0.9rem;">Precio</td><td style="padding:8px 0;">{price_str}</td></tr>'}
      <tr style="border-top:1px solid #333;">
        <td style="padding:8px 0;color:#a09070;font-size:0.9rem;">Nombre</td>
        <td style="padding:8px 0;">{appt.get('client_name', '')}</td>
      </tr>
    </table>
  </div>

  <div style="text-align:center;margin-top:28px;">
    <a href="{view_url}" style="display:inline-block;background:#C9A14A;color:#1a1a1a;text-decoration:none;padding:12px 28px;border-radius:4px;font-weight:bold;letter-spacing:0.06em;margin-bottom:12px;">
      Ver mi cita
    </a>
    <br>
    <a href="{edit_url}" style="color:#C9A14A;text-decoration:none;font-size:0.9rem;margin-right:20px;">
      Modificar cita
    </a>
    <a href="{cancel_url}" style="color:#a09070;text-decoration:none;font-size:0.9rem;">
      Cancelar cita
    </a>
  </div>

  <p style="color:#6a6050;font-size:0.78rem;text-align:center;margin-top:28px;">
    Puedes modificar o cancelar tu cita hasta 24 horas antes.<br>
    Este email fue generado automáticamente por Vidal Barber.
  </p>
</div>
</body>
</html>
"""
    send_email(appt["client_email"], f"Cita confirmada — {date_fmt} a las {appt['start_time']}", html)


def send_cancellation_confirmation(appt: dict, service: dict):
    """Send cancellation confirmation email."""
    date_fmt = _format_date(appt["date"])

    html = f"""
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#1a1a1a;font-family:Georgia,serif;color:#e8e0d0;">
<div style="max-width:560px;margin:0 auto;padding:32px 16px;">
  <div style="text-align:center;margin-bottom:32px;">
    <h1 style="color:#C9A14A;font-size:1.6rem;letter-spacing:0.15em;margin:0;">VIDAL BARBER</h1>
    <p style="color:#a09070;font-size:0.85rem;margin:4px 0 0;">Peluquería · Barbería · Estilo</p>
  </div>

  <div style="background:#242424;border:1px solid #3a3020;border-radius:8px;padding:28px;">
    <h2 style="color:#e05555;font-size:1.1rem;margin:0 0 20px;text-align:center;letter-spacing:0.08em;">
      CITA CANCELADA
    </h2>

    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:8px 0;color:#a09070;font-size:0.9rem;width:40%;">Servicio</td>
        <td style="padding:8px 0;font-weight:bold;">{service['name']}</td>
      </tr>
      <tr style="border-top:1px solid #333;">
        <td style="padding:8px 0;color:#a09070;font-size:0.9rem;">Fecha</td>
        <td style="padding:8px 0;">{date_fmt}</td>
      </tr>
      <tr style="border-top:1px solid #333;">
        <td style="padding:8px 0;color:#a09070;font-size:0.9rem;">Hora</td>
        <td style="padding:8px 0;">{appt['start_time']}</td>
      </tr>
    </table>
  </div>

  <p style="color:#a09070;text-align:center;margin-top:24px;font-size:0.9rem;">
    Tu cita ha sido cancelada correctamente.<br>
    Si lo deseas, puedes reservar una nueva cita en <a href="{APP_URL}/book" style="color:#C9A14A;">Vidal Barber</a>.
  </p>

  <p style="color:#6a6050;font-size:0.78rem;text-align:center;margin-top:20px;">
    Este email fue generado automáticamente por Vidal Barber.
  </p>
</div>
</body>
</html>
"""
    send_email(appt["client_email"], f"Cita cancelada — {date_fmt} a las {appt['start_time']}", html)


def send_modification_confirmation(appt: dict, service: dict):
    """Send modification confirmation email (same as booking confirmation but different subject)."""
    token = appt.get("token", "")
    edit_url = f"{APP_URL}/cita/{token}/editar"
    cancel_url = f"{APP_URL}/cita/{token}/cancelar"
    view_url = f"{APP_URL}/cita/{token}"
    date_fmt = _format_date(appt["date"])
    price_str = f"{service['price']:.0f}€" if service.get("price") else ""

    html = f"""
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#1a1a1a;font-family:Georgia,serif;color:#e8e0d0;">
<div style="max-width:560px;margin:0 auto;padding:32px 16px;">
  <div style="text-align:center;margin-bottom:32px;">
    <h1 style="color:#C9A14A;font-size:1.6rem;letter-spacing:0.15em;margin:0;">VIDAL BARBER</h1>
    <p style="color:#a09070;font-size:0.85rem;margin:4px 0 0;">Peluquería · Barbería · Estilo</p>
  </div>

  <div style="background:#242424;border:1px solid #3a3020;border-radius:8px;padding:28px;">
    <h2 style="color:#C9A14A;font-size:1.1rem;margin:0 0 20px;text-align:center;letter-spacing:0.08em;">
      ✏ CITA MODIFICADA
    </h2>

    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:8px 0;color:#a09070;font-size:0.9rem;width:40%;">Servicio</td>
        <td style="padding:8px 0;font-weight:bold;">{service['name']}</td>
      </tr>
      <tr style="border-top:1px solid #333;">
        <td style="padding:8px 0;color:#a09070;font-size:0.9rem;">Nueva fecha</td>
        <td style="padding:8px 0;">{date_fmt}</td>
      </tr>
      <tr style="border-top:1px solid #333;">
        <td style="padding:8px 0;color:#a09070;font-size:0.9rem;">Nueva hora</td>
        <td style="padding:8px 0;">{appt['start_time']} – {appt['end_time']}</td>
      </tr>
      {"" if not price_str else f'<tr style="border-top:1px solid #333;"><td style="padding:8px 0;color:#a09070;font-size:0.9rem;">Precio</td><td style="padding:8px 0;">{price_str}</td></tr>'}
    </table>
  </div>

  <div style="text-align:center;margin-top:28px;">
    <a href="{view_url}" style="display:inline-block;background:#C9A14A;color:#1a1a1a;text-decoration:none;padding:12px 28px;border-radius:4px;font-weight:bold;letter-spacing:0.06em;margin-bottom:12px;">
      Ver mi cita
    </a>
    <br>
    <a href="{edit_url}" style="color:#C9A14A;text-decoration:none;font-size:0.9rem;margin-right:20px;">
      Modificar de nuevo
    </a>
    <a href="{cancel_url}" style="color:#a09070;text-decoration:none;font-size:0.9rem;">
      Cancelar cita
    </a>
  </div>

  <p style="color:#6a6050;font-size:0.78rem;text-align:center;margin-top:28px;">
    Puedes modificar o cancelar tu cita hasta 24 horas antes.<br>
    Este email fue generado automáticamente por Vidal Barber.
  </p>
</div>
</body>
</html>
"""
    send_email(appt["client_email"], f"Cita modificada — {date_fmt} a las {appt['start_time']}", html)
