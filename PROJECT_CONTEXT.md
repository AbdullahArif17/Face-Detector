# Project Context

Last updated: 2026-06-25

## Project
- Name: Face Attendance
- Stage: Initial monorepo scaffold
- Objective: Build a multi-tenant AI face-recognition attendance SaaS.

## Current State
- Repository memory structure initialized.
- Application scaffold lives in `face-attendance/`.
- Frontend: Next.js 14, strict TypeScript, Tailwind CSS, App Router, shadcn/ui configuration.
- Backend: FastAPI, async SQLAlchemy, Neon Postgres, Alembic, JWT login, and basic company/employee/attendance routes.
- AI service: FastAPI, DeepFace Facenet512 with RetinaFace detection, OpenCV, and local NumPy embedding files for the MVP.
- Backend and AI-service dependencies are installed locally.
- The initial Neon migration is applied.
- Neon contains an idempotent demo dataset: one company, one branch, one admin, eight employees, and eight attendance records.
- Employee `1` has a local 512-dimensional face embedding enrolled from a consented test image.
- Recognition was verified with a second consented image, matching employee `1` at cosine confidence `0.8948`.
- Frontend dependencies are installed and the dashboard, employee list, and attendance list render live backend/Neon data.

## Working Assumptions
- Project knowledge must remain portable across chat agents and IDEs.
- Version-controlled repository files are the canonical shared memory.
- Agent-specific instruction files must reference this document rather than duplicate project state.

## Architecture
- `face-attendance/frontend`: browser dashboard on port 3000.
- `face-attendance/backend`: business API and Neon Postgres access on port 8000.
- `face-attendance/ai-service`: isolated biometric inference API on port 8001.
- Services are independently installable and runnable; no root workspace runner is configured.

## Constraints
- Do not place secrets or sensitive personal/biometric data in repository memory.
- Record privacy, consent, storage, and retention requirements before handling real face data.
- Do not add payment or billing code until explicitly requested.
- Local `.npy` embedding storage is MVP-only and must be replaced before production.

## Canonical Commands
| Task | Command |
|---|---|
| Frontend setup | `cd face-attendance/frontend && npm install` |
| Frontend run | `cd face-attendance/frontend && npm run dev` |
| Frontend checks | `cd face-attendance/frontend && npm run typecheck && npm run lint` |
| Backend run | `cd face-attendance/backend && uvicorn main:app --reload --port 8000` |
| Seed demo data | `cd face-attendance/backend && .\.venv\Scripts\python.exe -m scripts.seed` |
| AI service run | `cd face-attendance/ai-service && uvicorn main:app --reload --port 8001` |

## Active Work
- Connect the login form to JWT authentication and protect dashboard routes.
- Add tenant-scoped authorization, tests, and CI.
- Define biometric consent, retention, deletion, encryption, and audit requirements.

## Open Questions
- What tenant-isolation and role-permission rules are required?
- Will attendance recognition use kiosk cameras, employee devices, or uploaded images?
- What jurisdiction-specific biometric compliance requirements apply?
- Which production embedding store and deployment platform will be used?

## Handoff
- Start with `face-attendance/README.md`.
- Use `python -m scripts.seed` to refresh missing demo records without creating duplicates.
- Frontend server components use `BACKEND_API_URL` from `frontend/.env.local`; default is `http://127.0.0.1:8000`.
- Do not treat local embedding files or the current unauthenticated CRUD routes as production security boundaries.
