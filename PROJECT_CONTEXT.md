# Project Context

Last updated: 2026-06-28

## Project
- Name: Face Attendance
- Stage: Phase 3 employee management and DB-backed face enrollment
- Objective: Build a multi-tenant AI face-recognition attendance SaaS.

## Current State
- Repository memory structure initialized.
- Application scaffold lives in `face-attendance/`.
- Frontend: Next.js 16.2.9, React 19.2.7, strict TypeScript, Tailwind CSS, App Router, shadcn/ui configuration.
- Backend: FastAPI, async SQLAlchemy, Neon Postgres, Alembic, JWT authentication, and tenant-filtered company/employee/attendance routes.
- AI service: FastAPI, DeepFace Facenet with RetinaFace detection, OpenCV, and stateless embedding extraction/comparison endpoints.
- Backend and AI-service dependencies are installed locally.
- The `initial_tables`, `employee_department_face_embeddings`, and `9428e714984a` Alembic migrations are generated and applied to the current Neon development database.
- `backend/.env` contains a working Neon pooled connection with SSL enabled.
- Backend Phase 3 stores face vectors in the `face_embeddings` table as JSON for the MVP.
- Historical Phase 1 local `.npy` enrollment/recognition tests succeeded, but local AI-service embedding files are no longer the active Phase 3 storage contract.
- Frontend dependencies are installed with Axios, AuthContext, signup/login flows, protected dashboard routes, and authenticated data requests.
- Frontend Phase 3 includes employee search/filter/table management, add/edit employee modal with optional face-photo enrollment and retry-on-failure handling, enrolled-state-aware face enrollment/update UI, webcam or uploaded-photo face enrollment modal, enrollment-focused dashboard stats, and employee headshot display.
- Backend and AI service share `AI_API_KEY` through environment configuration; backend no longer hardcodes the AI-service key.
- Frontend list consumers fetch all employee/attendance pages so dashboard stats are not truncated by backend pagination.
- `python -m app.seed` now creates the demo company, default branch, admin user, 8 dummy employees, today's attendance rows, and 4 synthetic placeholder face enrollment rows for UI testing.
- This workstation uses backend port 8002 in `frontend/.env.local` because an orphaned Windows listener occupies port 8000; project defaults remain port 8000.

## Working Assumptions
- Project knowledge must remain portable across chat agents and IDEs.
- Version-controlled repository files are the canonical shared memory.
- Agent-specific instruction files must reference this document rather than duplicate project state.

## Architecture
- `face-attendance/frontend`: browser dashboard on port 3000.
- `face-attendance/backend`: business API, Neon Postgres access, JWT auth, employee CRUD, and DB-backed face enrollment on port 8000.
- `face-attendance/ai-service`: isolated biometric inference API on port 8001; returns embeddings and compares supplied candidate vectors.
- Services are independently installable and runnable; no root workspace runner is configured.

## Constraints
- Do not place secrets or sensitive personal/biometric data in repository memory.
- Record privacy, consent, storage, and retention requirements before handling real face data.
- Do not add payment or billing code until explicitly requested.
- JSON embedding storage in Neon is MVP-only and must be replaced with encrypted tenant-isolated biometric storage before production.

## Canonical Commands
| Task | Command |
|---|---|
| Frontend setup | `cd face-attendance/frontend && npm install` |
| Frontend run | `cd face-attendance/frontend && npm run dev` |
| Frontend checks | `cd face-attendance/frontend && npm run typecheck && npm run lint` |
| Backend run | `cd face-attendance/backend && uvicorn main:app --reload --port 8000` |
| Backend migrate | `cd face-attendance/backend && .\.venv\Scripts\python.exe -m alembic upgrade head` |
| Seed demo data | `cd face-attendance/backend && .\.venv\Scripts\python.exe -m app.seed` |
| AI service run | `cd face-attendance/ai-service && uvicorn main:app --reload --port 8001` |

## Active Work
- Complete manual end-to-end webcam and uploaded-photo enrollment testing in the browser with the backend and AI service running together.
- If create-employee face enrollment fails in the modal, the employee profile remains saved and the modal stays open so enrollment can be retried without creating a duplicate employee.
- Add attendance recognition flow that sends enrolled vectors to the AI service and marks attendance on a match.
- Add authorization tests, CI, login rate limiting, email verification, and a refresh-token or secure-cookie strategy.
- Define biometric consent, retention, deletion, encryption, and audit requirements before production use.

## Open Questions
- What tenant-isolation and role-permission rules are required?
- Will attendance recognition use kiosk cameras, employee devices, or uploaded images?
- What jurisdiction-specific biometric compliance requirements apply?
- Which production embedding store and deployment platform will be used?

## Handoff
- Start with `face-attendance/README.md`.
- Apply migrations with `python -m alembic upgrade head`; latest revision is `9428e714984a_add_timestamps_and_fix_unique_`.
- Ensure backend and AI service `.env` files use the same `AI_API_KEY`.
- Use `python -m app.seed` to create the demo company, default branch, super administrator, dummy employees, attendance rows, and placeholder enrollment status rows.
- Frontend uses `NEXT_PUBLIC_API_URL` from `frontend/.env.local`.
- On this workstation, start the backend on port 8002 or restore `.env.local` to port 8000 after clearing the orphaned listener.
- Do not treat JSON embedding storage, local embedding files, or client-side route guards as sufficient production security boundaries.
