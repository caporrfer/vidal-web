import sqlite3
import bcrypt
from datetime import datetime, timezone
from app.config import DB_PATH, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def init_db():
    conn = get_db()
    c = conn.cursor()

    # Check if appointments table exists and needs migration
    tables = c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='appointments'").fetchone()
    if tables:
        # Table exists, check if user_id is NOT NULL
        table_info = c.execute("PRAGMA table_info(appointments)").fetchall()
        user_id_col = next((col for col in table_info if col[1] == 'user_id'), None)
        if user_id_col and user_id_col[3] == 1:  # col[3] = notnull flag
            # user_id is NOT NULL, need to migrate
            c.executescript("""
                CREATE TABLE appointments_temp AS SELECT * FROM appointments;
                DROP TABLE appointments;
                CREATE TABLE appointments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER REFERENCES users(id),
                    service_id INTEGER NOT NULL REFERENCES services(id),
                    date TEXT NOT NULL,
                    start_time TEXT NOT NULL,
                    end_time TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'confirmed',
                    notes TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT,
                    client_name TEXT,
                    client_email TEXT,
                    client_phone TEXT,
                    token TEXT,
                    UNIQUE(date, start_time)
                );
                INSERT INTO appointments SELECT * FROM appointments_temp;
                DROP TABLE appointments_temp;
            """)
            conn.commit()

    c.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            phone TEXT,
            role TEXT NOT NULL DEFAULT 'client',
            created_at TEXT NOT NULL,
            last_login TEXT
        );

        CREATE TABLE IF NOT EXISTS services (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            duration_minutes INTEGER NOT NULL DEFAULT 30,
            price REAL,
            active INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES users(id),
            service_id INTEGER NOT NULL REFERENCES services(id),
            date TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'confirmed',
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            client_name TEXT,
            client_email TEXT,
            client_phone TEXT,
            token TEXT,
            UNIQUE(date, start_time)
        );

        CREATE TABLE IF NOT EXISTS schedule_overrides (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL UNIQUE,
            is_closed INTEGER NOT NULL DEFAULT 0,
            open_morning TEXT,
            close_morning TEXT,
            open_afternoon TEXT,
            close_afternoon TEXT
        );
    """)

    # Seed admin user if not exists
    existing = c.execute("SELECT id FROM users WHERE email = ?", (ADMIN_EMAIL,)).fetchone()
    if not existing:
        now = datetime.now(timezone.utc).isoformat()
        c.execute(
            "INSERT INTO users (email, name, password_hash, role, created_at) VALUES (?, ?, ?, 'admin', ?)",
            (ADMIN_EMAIL, ADMIN_NAME, hash_password(ADMIN_PASSWORD), now),
        )

    # Seed default services if empty
    count = c.execute("SELECT COUNT(*) FROM services").fetchone()[0]
    if count == 0:
        now = datetime.now(timezone.utc).isoformat()
        services = [
            ("Corte de pelo", 30, 15.0),
            ("Tinte", 90, 45.0),
            ("Mechas", 120, 65.0),
            ("Peinado", 45, 20.0),
            ("Corte + Barba", 45, 20.0),
        ]
        c.executemany(
            "INSERT INTO services (name, duration_minutes, price) VALUES (?, ?, ?)",
            services,
        )

    # Migrate appointments table: add new columns if missing
    for col, typedef in [
        ("client_name", "TEXT"),
        ("client_email", "TEXT"),
        ("client_phone", "TEXT"),
        ("token", "TEXT"),
    ]:
        try:
            c.execute(f"ALTER TABLE appointments ADD COLUMN {col} {typedef}")
        except Exception:
            pass  # column already exists

    # Backfill existing appointments: copy client data from users and generate tokens
    import secrets as _secrets
    existing = c.execute(
        "SELECT a.id FROM appointments a WHERE a.token IS NULL"
    ).fetchall()
    for row in existing:
        appt_id = row[0]
        user_row = c.execute(
            """SELECT u.name, u.email, u.phone FROM appointments a
               LEFT JOIN users u ON a.user_id = u.id
               WHERE a.id = ?""",
            (appt_id,),
        ).fetchone()
        token = _secrets.token_urlsafe(32)
        if user_row:
            c.execute(
                """UPDATE appointments SET token=?, client_name=COALESCE(client_name,?),
                   client_email=COALESCE(client_email,?), client_phone=COALESCE(client_phone,?)
                   WHERE id=?""",
                (token, user_row[0], user_row[1], user_row[2], appt_id),
            )
        else:
            c.execute("UPDATE appointments SET token=? WHERE id=?", (token, appt_id))

    conn.commit()
    conn.close()
