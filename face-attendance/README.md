# Face Attendance

Production-oriented monorepo scaffold for a multi-tenant AI face-recognition attendance SaaS. It contains a Next.js dashboard, a FastAPI business API backed by Neon Postgres, and an isolated DeepFace recognition service.

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

Set `NEXT_PUBLIC_API_URL=http://localhost:8000` in `.env.local`. On the current Windows workstation, use `http://localhost:8002` if port `8000` is still occupied by the orphaned listener noted in the project context.

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

Paste that value into `SECRET_KEY`, confirm `AI_SERVICE_URL=http://localhost:8001`, then run:

```bash
alembic upgrade head
uvicorn main:app --reload --port 8000
```

Create the demo company, default branch, super administrator, dummy employees, attendance rows, and placeholder enrollment status rows:

```bash
python -m app.seed
```

The seed is idempotent and stores its demo password as a bcrypt hash. The demo credentials are defined only in `app/seed.py`.

### Backend endpoints

Authentication:

- `POST /auth/signup`
- `POST /auth/login`
- `GET /auth/me` with a Bearer token

Employee, attendance, face enrollment, and company endpoints require a valid access token. Employee write operations require an `admin` or `super_admin` role.

Phase 3 employee and face endpoints:

- `GET /employees`
- `POST /employees`
- `PUT /employees/{id}`
- `DELETE /employees/{id}` soft-deletes by setting `status = "inactive"`
- `POST /face/enroll/{employee_id}`
- `GET /face/enrollment-status/{employee_id}`
- `DELETE /face/unenroll/{employee_id}`

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

`POST /enroll` returns a DeepFace embedding vector to the backend. The backend stores that vector in the `face_embeddings` database table. `POST /recognize` accepts a request image plus candidate vectors and returns the best cosine-similarity match above the configured threshold.

DeepFace downloads the configured model weights on first use to the current user's `.deepface/weights` directory.

## Production Follow-ups

- Add automated backend and frontend tests in CI.
- Use Neon's pooled connection URL for the application runtime and review direct-connection requirements before running production migrations.
- Replace JSON embedding storage with encrypted tenant-isolated biometric storage before production.
- Add liveness/readiness probes, structured logs, tracing, and rate limits.
- Define biometric consent, retention, deletion, and audit policies before collecting real face data.

Payment and billing functionality is intentionally excluded.
