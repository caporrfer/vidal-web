from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Optional
import sqlite3

TZ = ZoneInfo("Europe/Madrid")

# weekday() -> 0=Monday, 6=Sunday
DEFAULT_SCHEDULE: dict[int, list[tuple[str, str]]] = {
    0: [("10:00", "14:00"), ("16:00", "20:30")],
    1: [("10:00", "14:00"), ("16:00", "20:30")],
    2: [("10:00", "14:00"), ("16:00", "20:30")],
    3: [("10:00", "14:00"), ("16:00", "20:30")],
    4: [("10:00", "14:00"), ("16:00", "20:30")],
    5: [("10:00", "14:00")],
    6: [],
}


def _parse_time(t: str) -> time:
    h, m = t.split(":")
    return time(int(h), int(m))


def _get_blocks_for_date(target_date: date, conn: sqlite3.Connection) -> list[tuple[str, str]]:
    """Returns list of (open, close) string pairs for the given date, considering overrides."""
    override = conn.execute(
        "SELECT * FROM schedule_overrides WHERE date = ?", (target_date.isoformat(),)
    ).fetchone()

    if override:
        if override["is_closed"]:
            return []
        blocks = []
        if override["open_morning"] and override["close_morning"]:
            blocks.append((override["open_morning"], override["close_morning"]))
        if override["open_afternoon"] and override["close_afternoon"]:
            blocks.append((override["open_afternoon"], override["close_afternoon"]))
        return blocks

    return DEFAULT_SCHEDULE[target_date.weekday()]


def generate_slots(target_date: date, duration_minutes: int, conn: sqlite3.Connection) -> list[dict]:
    """Generate all theoretically available slots for a date and duration."""
    blocks = _get_blocks_for_date(target_date, conn)
    slots = []

    # Get booked slots for this date (non-cancelled)
    booked = conn.execute(
        "SELECT start_time FROM appointments WHERE date = ? AND status != 'cancelled'",
        (target_date.isoformat(),),
    ).fetchall()
    booked_times = {row["start_time"] for row in booked}

    now_madrid = datetime.now(TZ)
    is_today = target_date == now_madrid.date()

    for block_open, block_close in blocks:
        current = datetime.combine(target_date, _parse_time(block_open))
        block_end = datetime.combine(target_date, _parse_time(block_close))

        while current + timedelta(minutes=duration_minutes) <= block_end:
            slot_start = current.strftime("%H:%M")
            slot_end = (current + timedelta(minutes=duration_minutes)).strftime("%H:%M")

            # Skip past slots if today
            if is_today:
                slot_dt_aware = current.replace(tzinfo=TZ)
                if slot_dt_aware <= now_madrid:
                    current += timedelta(minutes=duration_minutes)
                    continue

            slots.append({
                "start_time": slot_start,
                "end_time": slot_end,
                "available": slot_start not in booked_times,
            })
            current += timedelta(minutes=duration_minutes)

    return slots
