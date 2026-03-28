import os
from dotenv import load_dotenv

load_dotenv()

SESSION_SECRET_KEY = os.getenv("SESSION_SECRET_KEY", "dev-secret-change-in-production")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@peluqueria.local")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin")
ADMIN_NAME = os.getenv("ADMIN_NAME", "Administrador")
ADMIN_PIN = os.getenv("ADMIN_PIN", "admin1234")
APP_URL = os.getenv("APP_URL", "http://localhost:8095")
DEFAULT_SLOT_DURATION = int(os.getenv("DEFAULT_SLOT_DURATION", "30"))
DB_PATH = os.getenv("DB_PATH", "/data/citas.db")

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "")
