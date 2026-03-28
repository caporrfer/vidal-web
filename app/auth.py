from datetime import datetime, timezone, timedelta
from typing import Optional
import bcrypt
import hmac
from fastapi import Request, HTTPException
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from app.config import SESSION_SECRET_KEY, ADMIN_PIN

serializer = URLSafeTimedSerializer(SESSION_SECRET_KEY)

SESSION_COOKIE = "auth_token"
CLIENT_MAX_AGE = 7 * 24 * 3600   # 7 days
ADMIN_MAX_AGE = 8 * 3600          # 8 hours

# In-memory rate limiter: {ip: [timestamp, ...]}
_login_attempts: dict[str, list[float]] = {}
RATE_LIMIT_WINDOW = 15 * 60   # 15 minutes
RATE_LIMIT_MAX = 5


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def check_rate_limit(ip: str) -> bool:
    """Returns True if allowed, False if rate limited."""
    now = datetime.now(timezone.utc).timestamp()
    attempts = _login_attempts.get(ip, [])
    # Remove old attempts outside window
    attempts = [t for t in attempts if now - t < RATE_LIMIT_WINDOW]
    _login_attempts[ip] = attempts
    if len(attempts) >= RATE_LIMIT_MAX:
        return False
    return True


def record_failed_attempt(ip: str):
    now = datetime.now(timezone.utc).timestamp()
    attempts = _login_attempts.get(ip, [])
    attempts.append(now)
    _login_attempts[ip] = attempts


def create_session_cookie(response, user_id: int, role: str):
    max_age = ADMIN_MAX_AGE if role == "admin" else CLIENT_MAX_AGE
    payload = {"user_id": user_id, "role": role}
    token = serializer.dumps(payload)
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        max_age=max_age,
        httponly=True,
        samesite="lax",
    )


def clear_session_cookie(response):
    response.delete_cookie(SESSION_COOKIE)


def get_current_user(request: Request) -> Optional[dict]:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    try:
        payload = serializer.loads(token, max_age=ADMIN_MAX_AGE * 24)  # generous outer TTL
        return payload  # {"user_id": int, "role": str}
    except (BadSignature, SignatureExpired):
        return None


def verify_admin_pin(pin: str) -> bool:
    """Constant-time comparison to prevent timing attacks."""
    return hmac.compare_digest(pin.strip(), ADMIN_PIN)


def require_admin(request: Request) -> dict:
    user = get_current_user(request)
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=302, headers={"Location": "/login"})
    return user
