# Face Attendance

Production-oriented monorepo scaffold for a multi-tenant AI face-recognition attendance SaaS. It contains a Next.js dashboard, a FastAPI business API backed by Neon Postgres, and an isolated DeepFace recognition service.

## Services

| Service | Stack | Default URL |
|---|---|---|
| `frontend` | Next.js 14, TypeScript, Tailwind CSS, shadcn/ui | `http://localhost:3000` |
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
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm run lint
npm run build
```

## Backend

Create a project at [Neon](https://console.neon.tech), open **Connect**, disable connection pooling, and copy the direct connection string. Then:

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

Set `DATABASE_URL` in `.env` to the copied Neon URL. The backend accepts Neon's standard `postgresql://...?...sslmode=require&channel_binding=require` format and converts it for SQLAlchemy asyncpg.

Set a strong application secret:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Paste that value into `SECRET_KEY`, then run:

```bash
alembic revision --autogenerate -m "initial schema"
alembic upgrade head
uvicorn main:app --reload --port 8000
```

Before calling `POST /auth/login`, create an initial company and user through a seed script or administration task. Passwords must be stored as bcrypt hashes.

Create repeatable demo data:

```bash
python -m scripts.seed
```

Default demo login:

```text
Email: admin@acme.example.com
Password: DemoPass123!
```

Set `DEMO_ADMIN_PASSWORD` before running the seed to override the demo password.

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
- Introduce a pooled Neon runtime URL separately from the direct migration URL when connection volume requires it.
- Replace local embedding files with encrypted tenant-isolated storage.
- Add liveness/readiness probes, structured logs, tracing, and rate limits.
- Define biometric consent, retention, deletion, and audit policies before collecting real face data.

Payment and billing functionality is intentionally excluded.
