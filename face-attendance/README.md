# Face Attendance

Production-oriented monorepo scaffold for a multi-tenant AI face-recognition attendance SaaS. It contains a Next.js dashboard, a FastAPI business API backed by Neon Postgres, and an isolated DeepFace recognition service.

## Services

| Service | Stack | Default URL |
|---|---|---|
| `frontend` | Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui | `http://localhost:3000` |
| `backend` | FastAPI, async SQLAlchemy, PostgreSQL, JWT | `http://localhost:8000` |
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

Set `NEXT_PUBLIC_API_URL=http://localhost:8000` in `.env.local`.

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

Paste that value into `SECRET_KEY`, then run:

```bash
alembic revision --autogenerate -m "initial_tables"
alembic upgrade head
uvicorn main:app --reload --port 8000
```

Create the Phase 2 demo company and super administrator:

```bash
python -m app.seed
```

The seed is idempotent and stores its demo password as a bcrypt hash. The demo credentials are defined only in `app/seed.py`.

Authentication endpoints:

- `POST /auth/signup`
- `POST /auth/login`
- `GET /auth/me` with a Bearer token

Employee, attendance, and company endpoints require a valid access token.

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

`POST /enroll` stores one normalized `.npy` embedding per employee under `ai-service/embeddings/`. `POST /recognize` performs cosine-similarity matching against those files.

DeepFace downloads the configured model weights on first use to the current user's `.deepface/weights` directory. The initial download for Facenet512 is approximately 95 MB.

## Production Follow-ups

- Add tenant-scoped authentication and authorization dependencies.
- Add database migrations, seed tooling, tests, and CI.
- Use Neon’s pooled connection URL for the application runtime and review direct-connection requirements before running production migrations.
- Replace local embedding files with encrypted tenant-isolated storage.
- Add liveness/readiness probes, structured logs, tracing, and rate limits.
- Define biometric consent, retention, deletion, and audit policies before collecting real face data.

Payment and billing functionality is intentionally excluded.
