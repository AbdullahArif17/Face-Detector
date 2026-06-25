# Project Context

Last updated: 2026-06-25

## Project
- Name: Face Attendance
- Stage: Initial monorepo scaffold
- Objective: Build a multi-tenant AI face-recognition attendance SaaS.

## Current State
- Repository memory structure initialized.
- Application scaffold lives in `face-attendance/`.
- Frontend: Next.js 16.2.9, React 19.2.7, strict TypeScript, Tailwind CSS, App Router, shadcn/ui configuration.
- Backend: FastAPI, async SQLAlchemy, Neon Postgres, Alembic, JWT authentication, and tenant-filtered company/employee/attendance routes.
- AI service: FastAPI, DeepFace Facenet512 with RetinaFace detection, OpenCV, and local NumPy embedding files for the MVP.
- Backend and AI-service dependencies are installed locally.
- The `initial_tables` Alembic migration is generated and verified against the current development database.
- `backend/.env` contains a working Neon pooled connection with SSL enabled.
- Employee `1` has a local 512-dimensional face embedding enrolled from a consented test image.
- Recognition was verified with a second consented image, matching employee `1` at cosine confidence `0.8948`.
- Frontend dependencies are installed with Axios, AuthContext, signup/login flows, protected dashboard routes, and authenticated data requests.
- This workstation uses backend port 8002 in `frontend/.env.local` because an orphaned Windows listener occupies port 8000; project defaults remain port 8000.

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
| Seed demo data | `cd face-attendance/backend && .\.venv\Scripts\python.exe -m app.seed` |
| AI service run | `cd face-attendance/ai-service && uvicorn main:app --reload --port 8001` |

## Active Work
- Keep the Neon connection healthy and add authorization tests, CI, login rate limiting, email verification, and a refresh-token or secure-cookie strategy.
- Define biometric consent, retention, deletion, encryption, and audit requirements.

## Open Questions
- What tenant-isolation and role-permission rules are required?
- Will attendance recognition use kiosk cameras, employee devices, or uploaded images?
- What jurisdiction-specific biometric compliance requirements apply?
- Which production embedding store and deployment platform will be used?

## Handoff
- Start with `face-attendance/README.md`.
- Use `python -m app.seed` to create the Phase 2 company and super administrator.
- Frontend uses `NEXT_PUBLIC_API_URL` from `frontend/.env.local`.
- On this workstation, start the backend on port 8002 or restore `.env.local` to port 8000 after clearing the orphaned listener.
- Do not treat local embedding files or client-side route guards as sufficient production security boundaries.
