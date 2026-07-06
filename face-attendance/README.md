# Face Attendance

Production-oriented monorepo scaffold for a multi-tenant AI face-recognition attendance SaaS. It has pivoted from employee attendance to school student attendance with WhatsApp parent notifications. It contains a Next.js dashboard, a FastAPI business API backed by Neon Postgres, and an isolated DeepFace recognition service.

## Services

| Service | Stack | Default URL |
|---|---|---|
| `frontend` | Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui | `http://localhost:3000` |
| `backend` | FastAPI, async SQLAlchemy, Neon PostgreSQL, JWT | `http://localhost:8000` |
| `ai-service` | FastAPI, OpenCV, DeepFace, NumPy | `http://localhost:8001` |

## Prerequisites

- Node.js 20+
- Python 3.11+
- A Neon account and project

## Frontend

```bash
cd frontend
npm install
copy .env.example .env.local
npm run dev
```

Set `NEXT_PUBLIC_API_URL=http://localhost:8000` in `.env.local`. On the current Windows workstation, use `http://localhost:8004` if ports `8000`/`8002`/`8003` are still occupied by the stale listeners noted in the project context.

For phone/tablet testing on the same Wi-Fi, use your PC LAN IP instead of `localhost`, for example:

```bash
NEXT_PUBLIC_API_URL=http://192.168.0.116:8004
```

Then run the dev servers bound to all interfaces:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 0.0.0.0 --port 8004

cd ../frontend
npm.cmd run dev -- -H 0.0.0.0
```

Open `http://192.168.0.116:3000` on the phone. The phone and PC must be on the same Wi-Fi/network, and Windows Firewall must allow ports `3000` and the active backend port.

Mobile browser limitations:

- Live webcam access and the modern Clipboard API require a trusted secure context. `http://192.168.x.x` is not secure on phones.
- The kiosk page includes a `Capture/Upload Photo` fallback for local HTTP testing. This uses the phone file/camera picker and can still submit attendance.
- For true live mobile kiosk scanning, use a trusted HTTPS URL for the frontend. Keep `NEXT_PUBLIC_API_URL=/api/backend` so browser API calls stay same-origin and Next.js proxies them to FastAPI through `BACKEND_INTERNAL_URL`.

Local trusted-HTTPS testing with a tunnel:

```powershell
cd frontend
$env:NEXT_PUBLIC_API_URL="/api/backend"
$env:BACKEND_INTERNAL_URL="http://127.0.0.1:8004"
npm.cmd run dev -- -H 0.0.0.0
```

Then expose the frontend through a trusted HTTPS tunnel, for example with Cloudflare Tunnel:

```powershell
cloudflared tunnel --url http://localhost:3000
```

Open the generated `https://...trycloudflare.com` URL on the phone. If you open Settings through that HTTPS URL, copied kiosk links will also use that HTTPS origin.

Self-signed LAN HTTPS can work only if the phone trusts the generated certificate/root CA. If the phone still marks the page as not trusted, live camera access can remain blocked.

Useful checks:

```bash
npm run typecheck
npm run lint
npm run build
```

## Backend

Create a project at [Neon](https://console.neon.tech), open **Connect**, select the SQLAlchemy connection format, and copy the connection string.

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install and configure:

```bash
pip install -r requirements.txt
copy .env.example .env
```

Set `DATABASE_URL` in `.env` to the copied Neon URL. The backend converts standard `postgresql://` URLs and `sslmode=require` to SQLAlchemy asyncpg format.

Set a strong application secret:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Paste that value into `SECRET_KEY`, set `AI_API_KEY`, confirm `AI_SERVICE_URL=http://localhost:8001`, optionally set `META_WHATSAPP_TOKEN` and `META_PHONE_NUMBER_ID` as global WhatsApp fallbacks, then run:

```bash
alembic upgrade head
uvicorn main:app --reload --port 8000
```

Create the demo school, classes, super administrator, dummy students, attendance rows, and placeholder enrollment status rows:

```bash
python -m app.seed
```

The seed is idempotent and stores its demo password as a bcrypt hash. The demo credentials are defined only in `app/seed.py`.

Demo portal login:

```text
Organization / School: Demo School
Email: admin@demo.com
Password: admin123
```

### Backend endpoints

Authentication:

- `POST /auth/signup`
- `POST /auth/login` with `organization_name`, `email`, and `password`
- `GET /auth/me` with a Bearer token

User emails are scoped per organization. The same email address can exist in multiple organizations, but a single organization cannot have two users with the same email.

Student, attendance dashboard, face enrollment, WhatsApp notification, user management, and company endpoints require a valid access token. Kiosk auto-marking uses a school/company `X-API-Key` header instead of JWT. Student and face write operations require `super_admin`, `admin`, or `hr`; user management requires `super_admin` or `admin`; company list/create requires `super_admin`.

Phase 3 employee and face endpoints:

- `GET /employees`
- `POST /employees`
- `PUT /employees/{id}`
- `DELETE /employees/{id}` soft-deletes by setting `status = "inactive"`
- `POST /face/enroll/{employee_id}`
- `GET /face/enrollment-status/{employee_id}`
- `DELETE /face/unenroll/{employee_id}`

Phase 4 user, kiosk, and attendance endpoints:

- `GET /users`
- `POST /users`
- `PUT /users/{id}`
- `DELETE /users/{id}` soft-deactivates by setting `is_active = false`
- `POST /users/{id}/activate` reactivates a soft-deactivated user
- `GET /companies/{id}/api-key`
- `POST /companies/{id}/regenerate-key`
- `GET /companies/kiosk-info` with `X-API-Key`
- `POST /attendance/auto-mark` with `X-API-Key`
- `GET /attendance/today`
- `GET /attendance/history`
- `GET /attendance/export`
- `GET /attendance/sessions`
- `GET /attendance/sessions/active?branch_id=[CLASS_ID]`
- `POST /attendance/sessions/start`
- `POST /attendance/sessions/{session_id}/stop`

The frontend includes `/users`, `/settings` kiosk setup, `/attendance` class-wise start/stop controls, and standalone `/kiosk?key=[API_KEY]&branch=[BRANCH_ID]`. Kiosk attendance only marks while the selected class has an active attendance session.

Phase 5 student and WhatsApp endpoints:

- `GET /students`
- `POST /students`
- `PUT /students/{id}`
- `DELETE /students/{id}` soft-deletes by setting `status = "inactive"`
- `GET /students/{id}/whatsapp-logs`
- `POST /students/import` CSV upload with `student_name,student_code,grade,section,parent_name,parent_phone`
- `GET /whatsapp/logs`
- `GET /whatsapp/stats`
- `POST /whatsapp/test`
- `POST /whatsapp/retry-failed`
- `GET /companies/{id}/settings`
- `PUT /companies/{id}/settings`

The frontend includes `/students` and `/notifications`. Parent phone numbers are masked in frontend displays. Live mobile kiosk camera access requires a trusted HTTPS frontend URL; local HTTP testing can use the kiosk photo fallback.

## AI Service

```bash
cd ai-service
python -m venv .venv
```

Activate the virtual environment, then:

```bash
pip install -r requirements.txt
copy .env.example .env
uvicorn main:app --reload --port 8001
```

Set the same `AI_API_KEY` value in `backend/.env` and `ai-service/.env` so the backend can call protected AI-service endpoints.

`POST /enroll` returns a DeepFace embedding vector to the backend. The backend stores that vector in the `face_embeddings` database table against a student. `POST /recognize` accepts a request image plus candidate vectors and returns the best cosine-similarity match above the configured threshold.

DeepFace downloads the configured model weights on first use to the current user's `.deepface/weights` directory.

## Production Follow-ups

- Add automated backend and frontend tests in CI.
- Use Neon's pooled connection URL for the application runtime and review direct-connection requirements before running production migrations.
- Replace JSON embedding storage with encrypted tenant-isolated biometric storage before production.
- Move WhatsApp tokens into encrypted secret storage before production and add delivery webhooks.
- Add liveness/readiness probes, structured logs, tracing, and rate limits.
- Define biometric consent, retention, deletion, and audit policies before collecting real face data.

Payment and billing functionality is intentionally excluded.
