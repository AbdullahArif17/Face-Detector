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

For production biometric encryption, generate a Fernet key without committing it:

```powershell
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Set it as `BIOMETRIC_ENCRYPTION_KEY` in the backend deployment, run migrations,
then convert any existing plaintext MVP embeddings:

```bash
python -m app.encrypt_face_embeddings
```

Reset the development database to a clean Demo School tenant with one admin, 3 classes, 8 students, today's attendance rows, and no face embeddings:

```bash
python -m app.reset_demo_data
```

This reset is intentionally destructive for local/dev data. It preserves the Demo School company row, API key, and WhatsApp settings, then recreates the demo admin and school data. Re-enroll real student faces after reset because ArcFace embeddings must be generated from real photos.

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
- `GET /attendance/sessions/classes`
- `GET /attendance/sessions/active?class_id=[CLASS_ID]`
- `POST /attendance/sessions/start`
- `POST /attendance/sessions/{session_id}/stop`
- `GET /companies/{company_id}/classes`

The frontend includes `/users`, `/settings` kiosk setup, an `/attendance` ON/OFF board for every class, and standalone `/kiosk?key=[API_KEY]&class_id=[CLASS_ID]`. Kiosk attendance only marks while that class has a session open for the current school day. Legacy `branch_id` URLs remain accepted.

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

### WhatsApp templates and chatbot

Automated check-in, check-out, and absence notifications must use approved Meta
Utility templates outside the 24-hour customer-service window. Configure:

```text
META_GRAPH_API_VERSION=v25.0
META_TEMPLATE_LANGUAGE=en
META_TEST_TEMPLATE_LANGUAGE=en_US
META_CHECKIN_TEMPLATE_NAME=school_checkin_alert
META_CHECKOUT_TEMPLATE_NAME=school_checkout_alert
META_ABSENT_TEMPLATE_NAME=school_absent_alert
META_TEST_TEMPLATE_NAME=hello_world
```

Secure webhook POST requests require `META_APP_SECRET`. Meta webhook verification
uses `META_WEBHOOK_VERIFY_TOKEN`. Subscribe the WhatsApp Business Account to the
`messages` field and use:

```text
https://YOUR-BACKEND.vercel.app/webhooks/whatsapp
```

Parents whose number matches an active student can send `STATUS` to receive the
student's attendance for the current school day. Inbound webhook message IDs are
deduplicated, and outbound delivery failures are visible on `/notifications`.

Vercel Cron calls `/api/cron/absent-alerts` daily at `0 4 * * *` (9:00 AM PKT).
On Vercel Hobby, daily cron execution can occur later within that hour; use a Pro
plan or an external scheduler if exact-minute delivery is required.

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

This service already follows an API-key model: the backend calls the isolated inference API with `X-API-Key`. It remains self-hosted because currently available cloud face-identification free tiers are temporary or restricted, and switching providers would send student biometrics to another processor. Treat any future managed provider as an explicit privacy, consent, residency, retention, and billing decision.

`POST /enroll` returns a DeepFace embedding vector to the backend. The backend stores that vector in the `face_embeddings` database table against a student. `POST /recognize` accepts a request image plus candidate vectors and returns the best cosine-similarity match above the configured threshold.

The current accuracy-focused AI configuration uses `DEEPFACE_MODEL=ArcFace`, `DETECTOR_BACKEND=retinaface`, image quality gates, original+horizontal-flip embedding averaging, and a best-vs-runner-up margin check. If the model is changed, existing student faces must be re-enrolled because embedding dimensions/semantics are model-specific.

New production embeddings are encrypted before database storage when
`BIOMETRIC_ENCRYPTION_KEY` is configured. Recognition only compares embeddings
created by the configured `AI_MODEL_NAME` (default `ArcFace`).

DeepFace downloads the configured model weights on first use to the current user's `.deepface/weights` directory.

## Production checklist

- Apply `alembic upgrade head` before deploying backend code.
- Set `APP_TIMEZONE=Asia/Karachi`, `APP_ENV=production`, a strong `SECRET_KEY`,
  `CRON_SECRET`, `AI_API_KEY`, and `BIOMETRIC_ENCRYPTION_KEY` in Vercel.
- Set the same `AI_API_KEY` as a Hugging Face Space secret and deploy the Docker Space.
- Confirm Hugging Face `RECOGNITION_THRESHOLD=0.58` and
  `RECOGNITION_MARGIN=0.03`; stale stricter overrides can reject otherwise valid
  matches in classes with multiple enrolled students.
- Set `BACKEND_INTERNAL_URL` to the deployed backend in the frontend Vercel project.
- Set `NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL` in the frontend Vercel project so the
  public privacy, terms, and data-deletion pages show the responsible contact.
- Set `FRONTEND_ORIGINS` to exact HTTPS frontend domains; do not use `*`.
- Confirm `/health`, `/ready`, Meta webhook verification, a signed webhook event,
  student face enrollment, and a live class-session kiosk scan after each deployment.
- For Meta test-number deployments, set `WHATSAPP_TEST_MODE=true` and
  `WHATSAPP_TEST_RECIPIENT=923...`. The backend then blocks every outbound recipient
  except that exact normalized number. Disable test mode before onboarding real parents.

## Remaining production follow-ups

- Run the existing backend, AI-service, frontend typecheck, lint, build, and dependency
  audit checks in CI on every pull request.
- Use Neon's pooled connection URL for the application runtime and review direct-connection requirements before running production migrations.
- Move per-school WhatsApp tokens out of database columns into a managed encrypted
  secret store before onboarding independent customer organizations.
- Move browser authentication from localStorage to secure HttpOnly cookies and add
  refresh-token rotation before handling high-risk production accounts.
- Add centralized structured logs and tracing, and replace in-process rate limits with
  a shared production store when the service scales beyond one instance.
- Evaluate stronger passive liveness detection for camera-only deployments; the current
  optional anti-spoofing mode is disabled by default so uploaded enrollment photos remain supported.
- Define and implement biometric consent, retention, deletion, WhatsApp opt-in, and
  audit policies before collecting real student data.

Payment and billing functionality is intentionally excluded.
