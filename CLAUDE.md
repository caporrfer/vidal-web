# CLAUDE.md — Contexto del proyecto peluqueria-citas

## Qué es este proyecto

Aplicación web para gestionar citas de una peluquería. Permite a los clientes registrarse (con email/contraseña o Google OAuth), ver disponibilidad y reservar citas online. El administrador tiene un panel para ver, filtrar y gestionar todas las citas, servicios y horarios especiales.

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Backend | Python 3.13 + FastAPI |
| Templates | Jinja2 (server-side rendering) |
| Interactividad | Vanilla JS (calendario, selección de slots via AJAX) |
| Base de datos | SQLite en `/data/citas.db` |
| Auth admin | bcrypt + cookie firmada (itsdangerous) |
| Auth clientes | Email+contraseña (bcrypt) o Google OAuth (authlib) |
| Sesión OAuth | Starlette SessionMiddleware (cookie `session`) |
| Sesión auth | itsdangerous (cookie `auth_token`) — nombre distinto para evitar conflicto con SessionMiddleware |
| Estilos | CSS puro, mobile-first, tema oscuro |
| Tipografía | `Cormorant Garamond` (display) + `DM Sans` (body) — Google Fonts |
| Despliegue | Docker + Docker Compose en Raspberry Pi |

## Estructura de ficheros

```
peluqueria-citas/
├── app/
│   ├── main.py          # FastAPI: todas las rutas y lógica
│   ├── auth.py          # Sesiones, bcrypt, rate limiting
│   ├── slots.py         # Motor de generación de slots horarios
│   ├── models.py        # Inicialización BD, seed admin y servicios
│   ├── config.py        # Variables de entorno
│   ├── static/
│   │   ├── styles.css   # CSS completo, tema oscuro, mobile-first
│   │   └── app.js       # JS: lógica de reserva (calendario + slots AJAX)
│   └── templates/
│       ├── base.html
│       ├── index.html         # Landing page
│       ├── login.html         # Login (email/contraseña + botón Google)
│       ├── register.html      # Registro (email/contraseña + botón Google)
│       ├── book.html          # Página de reserva
│       ├── my_appointments.html
│       └── admin/
│           ├── dashboard.html
│           ├── appointments.html
│           ├── services.html
│           └── schedule.html
├── data/                # Volumen Docker (NO en git)
│   └── citas.db         # SQLite
├── docker-compose.yml
├── Dockerfile
├── .env                 # Secretos (NO en git)
├── .env.example
├── requirements.txt
└── CLAUDE.md            # Este fichero
```

## Base de datos (SQLite)

### Tabla `users`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER PK | Autoincremental |
| email | TEXT UNIQUE | Email del usuario |
| name | TEXT | Nombre completo |
| password_hash | TEXT | bcrypt hash (usuarios OAuth tienen hash aleatorio inutilizable) |
| phone | TEXT | Teléfono opcional |
| role | TEXT | `admin` o `client` |
| created_at | TEXT | ISO 8601 |
| last_login | TEXT | ISO 8601 |

### Tabla `services`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER PK | |
| name | TEXT | Nombre del servicio |
| duration_minutes | INTEGER | Duración en minutos |
| price | REAL | Precio en euros |
| active | INTEGER | 1=activo, 0=inactivo (soft delete) |

### Tabla `appointments`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER PK | |
| user_id | INTEGER FK nullable | Referencia a users — NULL para reservas públicas sin login |
| service_id | INTEGER FK | Referencia a services |
| date | TEXT | YYYY-MM-DD |
| start_time | TEXT | HH:MM |
| end_time | TEXT | HH:MM |
| status | TEXT | `confirmed`, `cancelled`, `completed` |
| notes | TEXT | Notas opcionales |
| client_name | TEXT | Nombre del cliente (reservas sin login) |
| client_email | TEXT | Email del cliente |
| client_phone | TEXT | Teléfono del cliente |
| token | TEXT | Token único para gestión sin login (ver/cancelar/editar) |
| created_at / updated_at | TEXT | ISO 8601 |

Restricción `UNIQUE(date, start_time)` para prevenir doble reserva.

> **Importante**: `user_id` es nullable. Las reservas públicas (sin login) tienen `user_id = NULL` e identifican al cliente por `client_name/email/phone`. `models.py` incluye una migración automática al arranque que corrige la constraint `NOT NULL` si la BD fue creada con el esquema antiguo.

### Tabla `schedule_overrides`
Permite marcar días festivos o cambiar el horario de un día concreto.

## Horario base (slots.py)

```
Lunes–Viernes: 10:00–14:00 y 16:00–20:30
Sábado:        10:00–14:00
Domingo:       cerrado
```

Slots generados automáticamente cada 30 minutos (configurable por servicio). La zona horaria es `Europe/Madrid`.

## Rutas principales (main.py)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/POST | `/login` | Login unificado admin y cliente |
| GET/POST | `/register` | Registro de cliente con email |
| GET | `/auth/google` | Inicia flujo OAuth con Google |
| GET | `/auth/google/callback` | Callback OAuth — crea usuario si no existe |
| GET | `/book` | Página de reserva pública (sin login) |
| GET | `/api/slots` | Slots disponibles en JSON (AJAX) |
| POST | `/book` | Crear cita (sin login, datos de cliente en formulario) |
| GET | `/cita/{token}` | Ver cita por token |
| GET/POST | `/cita/{token}/editar` | Editar cita (solo si >24h) |
| GET/POST | `/cita/{token}/cancelar` | Cancelar cita (solo si >24h) |
| GET | `/admin` | Dashboard admin con reloj en tiempo real |
| GET | `/admin/appointments` | Listado con filtros |
| POST | `/admin/appointments/{id}/status` | Cambiar estado |
| GET/POST | `/admin/services` | CRUD servicios |
| GET/POST | `/admin/schedule` | Gestión horarios especiales |

## Variables de entorno (.env)

```bash
SESSION_SECRET_KEY=       # Secret para firmar cookies (itsdangerous)
ADMIN_EMAIL=              # Email del admin (seeded al inicio)
ADMIN_PASSWORD=           # Contraseña del admin
ADMIN_NAME=               # Nombre del admin
APP_URL=                  # URL base de la app (importante para OAuth)
DEFAULT_SLOT_DURATION=30  # Duración base de slots en minutos
GOOGLE_CLIENT_ID=         # OAuth — dejar vacío para deshabilitar botón Google
GOOGLE_CLIENT_SECRET=     # OAuth
GOOGLE_REDIRECT_URI=      # Debe ser HTTPS para producción
```

## Google OAuth — notas importantes

- El botón de Google solo aparece si `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` están configurados.
- Google **exige HTTPS** para la redirect URI (no acepta IPs locales).
- Para pruebas: usar Cloudflare Quick Tunnel (`cloudflared tunnel --url http://localhost:8095`).
- Para producción: usar el dominio propio con Cloudflare Tunnel.
- Usuarios OAuth se crean automáticamente con un hash de contraseña aleatorio (no pueden hacer login con email/contraseña).
- **Cookie de sesión auth**: `auth_token` (itsdangerous). NO renombrar a `session` — conflicto con Starlette SessionMiddleware que usa ese nombre para el estado OAuth.

## Despliegue en Raspberry Pi

- **IP local**: `192.168.0.87`
- **Puerto**: `8095` (mapeado al `8000` interno)
- **URL local**: `http://192.168.0.87:8095`
- **Directorio**: `/home/raspberry/docker/peluqueria-citas/`

### Comandos útiles

```bash
# Rebuildar y levantar (necesario tras cambios en app/)
docker compose -f ~/docker/peluqueria-citas/docker-compose.yml up -d --build

# Solo reiniciar (cambios de .env sin tocar código)
docker compose -f ~/docker/peluqueria-citas/docker-compose.yml restart

# Ver logs
docker logs peluqueria-citas -f

# Consultar BD directamente
docker exec peluqueria-citas sqlite3 /data/citas.db "SELECT * FROM users;"
```

> **Importante**: `data/` está montado como volumen Docker — los datos persisten entre rebuilds. Los cambios en `app/` requieren `--build`.

## Tunnel temporal (para pruebas OAuth)

```bash
cloudflared tunnel --url http://localhost:8095 --no-autoupdate &
```

Tras lanzarlo, actualizar `.env` con la URL generada y rebuildar. La URL cambia cada vez que se relanza.

## Dashboard admin — detalles

- Reloj en tiempo real (JS, actualización cada segundo) con hora, día de semana, día, mes y año
- `font-variant-numeric: tabular-nums` para que los dígitos no salten al cambiar
- Estadísticas del día: citas totales, restantes, completadas, próximas
- Timeline de citas de hoy con estado visual (pasada/actual/futura)
- Strip de próximos 7 días con carga AJAX al hacer clic

## Pendiente

- Configurar dominio propio con Cloudflare Tunnel (producción)
- Actualizar `GOOGLE_REDIRECT_URI` y `APP_URL` con el dominio definitivo
- Añadir la redirect URI definitiva en Google Cloud Console
