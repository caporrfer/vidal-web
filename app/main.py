import secrets
from datetime import datetime, timezone, date as date_type, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import FastAPI, Request, Form, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.models import get_db, init_db
from app.auth import (
    verify_admin_pin, check_rate_limit, record_failed_attempt,
    create_session_cookie, clear_session_cookie, get_current_user,
)
from app.slots import generate_slots, _parse_time
from app.config import DEFAULT_SLOT_DURATION, APP_URL
from app.email import send_booking_confirmation, send_cancellation_confirmation, send_modification_confirmation

TZ = ZoneInfo("Europe/Madrid")

app = FastAPI(title="Peluquería Citas")
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")


@app.on_event("startup")
def startup():
    init_db()


# ─── Helpers ─────────────────────────────────────────────────────────────────

def get_admin_from_session(request: Request) -> Optional[dict]:
    session = get_current_user(request)
    if not session or session.get("role") != "admin":
        return None
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE id = ?", (session["user_id"],)).fetchone()
    conn.close()
    if not user:
        return None
    return dict(user)


def require_admin_user(request: Request) -> Optional[dict]:
    user = get_admin_from_session(request)
    if not user:
        return None
    return user


def css_version():
    import os
    try:
        return int(os.path.getmtime("app/static/styles.css"))
    except Exception:
        return "1"


def _build_dates():
    today = datetime.now(TZ).date()
    dates = []
    d = today
    for _ in range(45):
        if d.weekday() != 6:  # not Sunday
            dates.append(d)
        d += timedelta(days=1)
        if len(dates) >= 30:
            break
    return today, dates


# ─── Public routes ────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    user = get_admin_from_session(request)
    conn = get_db()
    services = conn.execute(
        "SELECT * FROM services WHERE active = 1 ORDER BY price"
    ).fetchall()
    conn.close()
    return templates.TemplateResponse("index.html", {
        "request": request,
        "user": user,
        "services": services,
        "css_v": css_version(),
    })


@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request, error: str = ""):
    user = get_admin_from_session(request)
    if user:
        return RedirectResponse("/admin", status_code=302)
    return templates.TemplateResponse("login.html", {
        "request": request,
        "error": error,
        "css_v": css_version(),
    })


@app.post("/login")
async def login(
    request: Request,
    pin: str = Form(...),
):
    ip = request.client.host if request.client else "unknown"

    if not check_rate_limit(ip):
        return templates.TemplateResponse("login.html", {
            "request": request,
            "error": "Demasiados intentos fallidos. Espera 15 minutos.",
            "css_v": css_version(),
        }, status_code=429)

    if not verify_admin_pin(pin):
        record_failed_attempt(ip)
        return templates.TemplateResponse("login.html", {
            "request": request,
            "error": "Contraseña incorrecta.",
            "css_v": css_version(),
        }, status_code=401)

    conn = get_db()
    admin = conn.execute("SELECT * FROM users WHERE role = 'admin' LIMIT 1").fetchone()
    now = datetime.now(timezone.utc).isoformat()
    conn.execute("UPDATE users SET last_login = ? WHERE id = ?", (now, admin["id"]))
    conn.commit()
    conn.close()

    response = RedirectResponse("/admin", status_code=302)
    create_session_cookie(response, admin["id"], "admin")
    return response


@app.get("/logout")
def logout():
    response = RedirectResponse("/", status_code=302)
    clear_session_cookie(response)
    return response


# ─── Booking routes (public — no login required) ──────────────────────────────

@app.get("/book", response_class=HTMLResponse)
def book_page(request: Request):
    conn = get_db()
    services = conn.execute(
        "SELECT * FROM services WHERE active = 1 ORDER BY price"
    ).fetchall()
    conn.close()

    today, dates = _build_dates()

    return templates.TemplateResponse("book.html", {
        "request": request,
        "user": get_admin_from_session(request),
        "services": services,
        "dates": dates,
        "today": today.isoformat(),
        "css_v": css_version(),
    })


@app.get("/api/slots")
def api_slots(request: Request, target_date: str, service_id: int):
    try:
        d = date_type.fromisoformat(target_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Fecha inválida")

    conn = get_db()
    service = conn.execute(
        "SELECT * FROM services WHERE id = ? AND active = 1", (service_id,)
    ).fetchone()
    if not service:
        conn.close()
        raise HTTPException(status_code=404, detail="Servicio no encontrado")

    slots = generate_slots(d, service["duration_minutes"], conn)
    conn.close()
    return {"slots": slots, "date": target_date}


@app.post("/book")
async def create_booking(
    request: Request,
    target_date: str = Form(...),
    start_time: str = Form(...),
    service_id: int = Form(...),
    client_name: str = Form(...),
    client_email: str = Form(...),
    client_phone: str = Form(...),
    notes: str = Form(""),
):
    client_name = client_name.strip()
    client_email = client_email.strip().lower()
    client_phone = client_phone.strip()

    if not client_name or not client_email or not client_phone:
        return RedirectResponse("/book?error=datos", status_code=302)

    conn = get_db()
    service = conn.execute(
        "SELECT * FROM services WHERE id = ? AND active = 1", (service_id,)
    ).fetchone()

    if not service:
        conn.close()
        return RedirectResponse("/book?error=servicio", status_code=302)

    try:
        d = date_type.fromisoformat(target_date)
    except ValueError:
        conn.close()
        return RedirectResponse("/book?error=fecha", status_code=302)

    start = _parse_time(start_time)
    end_dt = datetime.combine(d, start) + timedelta(minutes=service["duration_minutes"])
    end_time = end_dt.strftime("%H:%M")

    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc).isoformat()
    try:
        conn.execute(
            """INSERT INTO appointments
               (user_id, service_id, date, start_time, end_time, status, notes,
                client_name, client_email, client_phone, token, created_at)
               VALUES (NULL, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?)""",
            (service_id, target_date, start_time, end_time,
             notes.strip() or None, client_name, client_email, client_phone, token, now),
        )
        conn.commit()
    except Exception:
        conn.close()
        return RedirectResponse("/book?error=ocupado", status_code=302)

    # Send confirmation email in background
    appt = {
        "token": token,
        "date": target_date,
        "start_time": start_time,
        "end_time": end_time,
        "client_name": client_name,
        "client_email": client_email,
        "client_phone": client_phone,
    }
    send_booking_confirmation(appt, dict(service))
    conn.close()

    return RedirectResponse(f"/cita/{token}?booked=1", status_code=302)


# ─── Token-based appointment management ───────────────────────────────────────

def _get_appt_by_token(token: str) -> Optional[dict]:
    conn = get_db()
    row = conn.execute(
        """SELECT a.*, s.name as service_name, s.price, s.duration_minutes
           FROM appointments a
           JOIN services s ON a.service_id = s.id
           WHERE a.token = ?""",
        (token,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def _can_modify(appt: dict) -> bool:
    """Returns True if appointment is >24h away and confirmed."""
    if appt["status"] != "confirmed":
        return False
    try:
        appt_dt = datetime.fromisoformat(f"{appt['date']}T{appt['start_time']}:00").replace(tzinfo=TZ)
        return (appt_dt - datetime.now(TZ)).total_seconds() > 86400
    except Exception:
        return False


@app.get("/cita/{token}", response_class=HTMLResponse)
def view_appointment(request: Request, token: str, booked: str = ""):
    appt = _get_appt_by_token(token)
    if not appt:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    return templates.TemplateResponse("appointment.html", {
        "request": request,
        "user": get_admin_from_session(request),
        "appt": appt,
        "can_modify": _can_modify(appt),
        "booked": booked == "1",
        "css_v": css_version(),
    })


@app.get("/cita/{token}/editar", response_class=HTMLResponse)
def edit_appointment_page(request: Request, token: str, error: str = ""):
    appt = _get_appt_by_token(token)
    if not appt:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    if not _can_modify(appt):
        return RedirectResponse(f"/cita/{token}", status_code=302)

    conn = get_db()
    services = conn.execute(
        "SELECT * FROM services WHERE active = 1 ORDER BY price"
    ).fetchall()
    conn.close()

    today, dates = _build_dates()

    return templates.TemplateResponse("appointment_edit.html", {
        "request": request,
        "user": get_admin_from_session(request),
        "appt": appt,
        "services": services,
        "dates": dates,
        "today": today.isoformat(),
        "error": error,
        "css_v": css_version(),
    })


@app.post("/cita/{token}/editar")
async def edit_appointment(
    request: Request,
    token: str,
    target_date: str = Form(...),
    start_time: str = Form(...),
    service_id: int = Form(...),
):
    appt = _get_appt_by_token(token)
    if not appt:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    if not _can_modify(appt):
        return RedirectResponse(f"/cita/{token}", status_code=302)

    conn = get_db()
    service = conn.execute(
        "SELECT * FROM services WHERE id = ? AND active = 1", (service_id,)
    ).fetchone()
    if not service:
        conn.close()
        return RedirectResponse(f"/cita/{token}/editar?error=servicio", status_code=302)

    try:
        d = date_type.fromisoformat(target_date)
    except ValueError:
        conn.close()
        return RedirectResponse(f"/cita/{token}/editar?error=fecha", status_code=302)

    start = _parse_time(start_time)
    end_dt = datetime.combine(d, start) + timedelta(minutes=service["duration_minutes"])
    end_time = end_dt.strftime("%H:%M")

    now = datetime.now(timezone.utc).isoformat()
    try:
        conn.execute(
            """UPDATE appointments
               SET date=?, start_time=?, end_time=?, service_id=?, updated_at=?
               WHERE token=?""",
            (target_date, start_time, end_time, service_id, now, token),
        )
        conn.commit()
    except Exception:
        conn.close()
        return RedirectResponse(f"/cita/{token}/editar?error=ocupado", status_code=302)

    updated_appt = {**appt, "date": target_date, "start_time": start_time, "end_time": end_time}
    send_modification_confirmation(updated_appt, dict(service))
    conn.close()

    return RedirectResponse(f"/cita/{token}?edited=1", status_code=302)


@app.get("/cita/{token}/cancelar", response_class=HTMLResponse)
def cancel_appointment_page(request: Request, token: str):
    appt = _get_appt_by_token(token)
    if not appt:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    return templates.TemplateResponse("appointment_cancel.html", {
        "request": request,
        "user": get_admin_from_session(request),
        "appt": appt,
        "can_cancel": _can_modify(appt),
        "css_v": css_version(),
    })


@app.post("/cita/{token}/cancelar")
def cancel_appointment(request: Request, token: str):
    appt = _get_appt_by_token(token)
    if not appt:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    if not _can_modify(appt):
        return RedirectResponse(f"/cita/{token}", status_code=302)

    conn = get_db()
    service = conn.execute(
        "SELECT * FROM services WHERE id = ?", (appt["service_id"],)
    ).fetchone()

    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "UPDATE appointments SET status = 'cancelled', updated_at = ? WHERE token = ?",
        (now, token),
    )
    conn.commit()
    conn.close()

    cancelled_appt = {**appt, "status": "cancelled"}
    if service:
        send_cancellation_confirmation(cancelled_appt, dict(service))

    return RedirectResponse(f"/cita/{token}?cancelled=1", status_code=302)


# ─── Admin routes ─────────────────────────────────────────────────────────────

_APPT_QUERY = """
    SELECT a.*,
           COALESCE(a.client_name, u.name) as client_name,
           COALESCE(a.client_email, u.email) as client_email,
           COALESCE(a.client_phone, u.phone) as client_phone,
           s.name as service_name, s.duration_minutes, s.price
    FROM appointments a
    LEFT JOIN users u ON a.user_id = u.id
    JOIN services s ON a.service_id = s.id
"""


@app.get("/admin", response_class=HTMLResponse)
def admin_dashboard(request: Request):
    user = require_admin_user(request)
    if not user:
        return RedirectResponse("/login", status_code=302)

    now = datetime.now(TZ)
    today = now.date().isoformat()
    now_time = now.strftime("%H:%M")
    conn = get_db()

    today_appointments = conn.execute(
        _APPT_QUERY + " WHERE a.date = ? AND a.status != 'cancelled' ORDER BY a.start_time",
        (today,),
    ).fetchall()

    stats = conn.execute(
        """SELECT
           COUNT(CASE WHEN status = 'confirmed' AND date >= ? THEN 1 END) as upcoming,
           COUNT(CASE WHEN date = ? AND status != 'cancelled' THEN 1 END) as today_count,
           COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled
           FROM appointments""",
        (today, today),
    ).fetchone()

    remaining_today = conn.execute(
        "SELECT COUNT(*) as c FROM appointments WHERE date = ? AND status = 'confirmed' AND start_time > ?",
        (today, now_time),
    ).fetchone()["c"]

    completed_today = conn.execute(
        "SELECT COUNT(*) as c FROM appointments WHERE date = ? AND status = 'completed'",
        (today,),
    ).fetchone()["c"]

    # Next 7 days summary for week strip
    week_end = (now.date() + timedelta(days=7)).isoformat()
    week_rows = conn.execute(
        """SELECT date, COUNT(*) as count
           FROM appointments
           WHERE date > ? AND date <= ? AND status != 'cancelled'
           GROUP BY date ORDER BY date""",
        (today, week_end),
    ).fetchall()
    conn.close()

    day_names_es = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"]
    week_summary = []
    for i in range(1, 8):
        d = now.date() + timedelta(days=i)
        d_iso = d.isoformat()
        count = 0
        for row in week_rows:
            if row["date"] == d_iso:
                count = row["count"]
                break
        week_summary.append({
            "date": d_iso,
            "day_name": day_names_es[d.weekday()],
            "day_num": d.day,
            "count": count,
        })

    # Find current or next appointment
    current_appt = None
    for a in today_appointments:
        if a["start_time"] <= now_time < a["end_time"] and a["status"] == "confirmed":
            current_appt = dict(a)
            current_appt["_is_now"] = True
            break
    if not current_appt:
        for a in today_appointments:
            if a["start_time"] > now_time and a["status"] == "confirmed":
                current_appt = dict(a)
                current_appt["_is_now"] = False
                break

    return templates.TemplateResponse("admin/dashboard.html", {
        "request": request,
        "user": user,
        "today_appointments": today_appointments,
        "stats": stats,
        "today": today,
        "today_date_obj": now.date(),
        "now_time": now_time,
        "remaining_today": remaining_today,
        "completed_today": completed_today,
        "week_summary": week_summary,
        "current_appt": current_appt,
        "css_v": css_version(),
    })


@app.get("/admin/api/day")
def admin_api_day(request: Request, date: str = ""):
    user = require_admin_user(request)
    if not user:
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    if not date:
        return JSONResponse({"error": "date required"}, status_code=400)
    conn = get_db()
    appointments = conn.execute(
        _APPT_QUERY + " WHERE a.date = ? AND a.status != 'cancelled' ORDER BY a.start_time",
        (date,),
    ).fetchall()
    conn.close()
    result = []
    for a in appointments:
        result.append({
            "id": a["id"],
            "start_time": a["start_time"],
            "end_time": a["end_time"],
            "client_name": a["client_name"],
            "client_phone": a["client_phone"],
            "service_name": a["service_name"],
            "duration_minutes": a["duration_minutes"],
            "status": a["status"],
        })
    return JSONResponse(result)


@app.get("/admin/appointments", response_class=HTMLResponse)
def admin_appointments(
    request: Request,
    date_from: str = "",
    date_to: str = "",
    status: str = "",
    client: str = "",
):
    user = require_admin_user(request)
    if not user:
        return RedirectResponse("/login", status_code=302)

    query = _APPT_QUERY + " WHERE 1=1"
    params = []

    if date_from:
        query += " AND a.date >= ?"
        params.append(date_from)
    if date_to:
        query += " AND a.date <= ?"
        params.append(date_to)
    if status:
        query += " AND a.status = ?"
        params.append(status)
    if client:
        query += " AND (COALESCE(a.client_name, u.name) LIKE ? OR COALESCE(a.client_email, u.email) LIKE ?)"
        params.extend([f"%{client}%", f"%{client}%"])

    query += " ORDER BY a.date DESC, a.start_time DESC LIMIT 200"

    conn = get_db()
    appointments = conn.execute(query, params).fetchall()
    conn.close()

    return templates.TemplateResponse("admin/appointments.html", {
        "request": request,
        "user": user,
        "appointments": appointments,
        "filters": {"date_from": date_from, "date_to": date_to, "status": status, "client": client},
        "css_v": css_version(),
    })


@app.post("/admin/appointments/{appointment_id}/status")
def admin_change_status(request: Request, appointment_id: int, new_status: str = Form(...)):
    user = require_admin_user(request)
    if not user:
        return RedirectResponse("/login", status_code=302)

    if new_status not in ("confirmed", "cancelled", "completed"):
        return RedirectResponse("/admin/appointments", status_code=302)

    now = datetime.now(timezone.utc).isoformat()
    conn = get_db()
    conn.execute(
        "UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?",
        (new_status, now, appointment_id),
    )
    conn.commit()
    conn.close()
    return RedirectResponse("/admin/appointments", status_code=302)


@app.get("/admin/services", response_class=HTMLResponse)
def admin_services(request: Request, error: str = "", success: str = ""):
    user = require_admin_user(request)
    if not user:
        return RedirectResponse("/login", status_code=302)

    conn = get_db()
    services = conn.execute("SELECT * FROM services ORDER BY active DESC, price").fetchall()
    conn.close()

    return templates.TemplateResponse("admin/services.html", {
        "request": request,
        "user": user,
        "services": services,
        "error": error,
        "success": success,
        "css_v": css_version(),
    })


@app.post("/admin/services")
async def admin_create_service(
    request: Request,
    name: str = Form(...),
    duration_minutes: int = Form(...),
    price: float = Form(...),
):
    user = require_admin_user(request)
    if not user:
        return RedirectResponse("/login", status_code=302)

    conn = get_db()
    conn.execute(
        "INSERT INTO services (name, duration_minutes, price) VALUES (?, ?, ?)",
        (name.strip(), duration_minutes, price),
    )
    conn.commit()
    conn.close()
    return RedirectResponse("/admin/services?success=1", status_code=302)


@app.post("/admin/services/{service_id}/toggle")
def admin_toggle_service(request: Request, service_id: int):
    user = require_admin_user(request)
    if not user:
        return RedirectResponse("/login", status_code=302)

    conn = get_db()
    conn.execute(
        "UPDATE services SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = ?",
        (service_id,),
    )
    conn.commit()
    conn.close()
    return RedirectResponse("/admin/services", status_code=302)


@app.get("/admin/schedule", response_class=HTMLResponse)
def admin_schedule(request: Request, success: str = ""):
    user = require_admin_user(request)
    if not user:
        return RedirectResponse("/login", status_code=302)

    conn = get_db()
    overrides = conn.execute(
        "SELECT * FROM schedule_overrides ORDER BY date DESC LIMIT 60"
    ).fetchall()
    conn.close()

    return templates.TemplateResponse("admin/schedule.html", {
        "request": request,
        "user": user,
        "overrides": overrides,
        "success": success,
        "css_v": css_version(),
    })


@app.post("/admin/schedule")
async def admin_add_override(
    request: Request,
    override_date: str = Form(...),
    is_closed: int = Form(0),
    open_morning: str = Form(""),
    close_morning: str = Form(""),
    open_afternoon: str = Form(""),
    close_afternoon: str = Form(""),
):
    user = require_admin_user(request)
    if not user:
        return RedirectResponse("/login", status_code=302)

    conn = get_db()
    conn.execute(
        """INSERT INTO schedule_overrides
           (date, is_closed, open_morning, close_morning, open_afternoon, close_afternoon)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(date) DO UPDATE SET
             is_closed=excluded.is_closed,
             open_morning=excluded.open_morning,
             close_morning=excluded.close_morning,
             open_afternoon=excluded.open_afternoon,
             close_afternoon=excluded.close_afternoon""",
        (
            override_date,
            is_closed,
            open_morning or None,
            close_morning or None,
            open_afternoon or None,
            close_afternoon or None,
        ),
    )
    conn.commit()
    conn.close()
    return RedirectResponse("/admin/schedule?success=1", status_code=302)


@app.post("/admin/schedule/{override_id}/delete")
def admin_delete_override(request: Request, override_id: int):
    user = require_admin_user(request)
    if not user:
        return RedirectResponse("/login", status_code=302)

    conn = get_db()
    conn.execute("DELETE FROM schedule_overrides WHERE id = ?", (override_id,))
    conn.commit()
    conn.close()
    return RedirectResponse("/admin/schedule", status_code=302)
