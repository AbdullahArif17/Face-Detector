# Session Log

Keep recent entries concise. Summarize durable state in `PROJECT_CONTEXT.md`.

## 2026-06-25 — Memory initialization
- Created cross-agent repository memory files.
- Established `PROJECT_CONTEXT.md` as the current-state summary.
- Established an append-only decision log and session handoff log.
- No application architecture or technology choices have been made.

## 2026-06-25 — Face Attendance monorepo scaffold
- Completed: Created `face-attendance/` with Next.js frontend, async FastAPI backend, and DeepFace AI service.
- Changed: Added dashboard routes, shadcn/ui primitives, SQLAlchemy models/schemas/CRUD routers, JWT login, Alembic configuration, and local embedding enrollment/recognition.
- Verified: Required paths, frontend JSON files, and Python syntax.
- Pending: Install dependencies, generate the initial migration, run framework-native checks, and implement production security/compliance controls.

## 2026-06-25 — Neon database configuration
- Completed: Replaced the local PostgreSQL example with managed Neon Postgres configuration.
- Changed: Added Neon URL normalization for asyncpg, SSL handling, and hosted database setup documentation.
- Verified: Configuration accepts standard Neon connection URL parameters without exposing credentials.
- Pending: Create the Neon project, populate `backend/.env`, and run the initial migration.

## 2026-06-25 — AI service local setup
- Completed: Installed the Python 3.13 virtual environment dependencies and downloaded Facenet512 model weights.
- Changed: Added the required `tf-keras` compatibility dependency and Windows-safe Unicode logging.
- Verified: Dependency integrity, DeepFace/TensorFlow imports, Uvicorn health endpoint, and expected 422 handling for a non-face enrollment image.
- Pending: Test successful enrollment and recognition using consented sample face images.

## 2026-06-25 — Neon demo data
- Completed: Installed backend dependencies, confirmed the initial migration at head, and seeded Neon.
- Changed: Added an idempotent seed command with a demo company, branch, administrator, eight employees, and today's attendance records.
- Verified: Re-running the seed creates no duplicates; counts remain 1 company, 1 branch, 1 user, 8 employees, and 8 attendance records; demo login returns a JWT.
- Pending: Connect the frontend dashboard to the seeded backend data.

## 2026-06-25 — Frontend live data integration
- Completed: Connected dashboard, employees, and attendance pages to the FastAPI backend.
- Changed: Added a typed server-side API client, backend-unavailable states, live stat calculations, and employee/attendance tables.
- Verified: Backend returns 8 employees and 8 attendance records; frontend type-check, lint, production build, and rendered-page smoke tests pass.
- Pending: Implement frontend login and authenticated tenant-scoped requests.

## 2026-06-25 — First face enrollment
- Completed: Enrolled `D:\face.jpeg` as employee `1`.
- Changed: Switched the configurable face detector from OpenCV to RetinaFace to support the profile image.
- Verified: AI service returned a 512-dimensional embedding and created `ai-service/embeddings/1.npy`.
- Pending: Verify recognition with a second image of the same consented person.

## 2026-06-25 — Face recognition verification
- Completed: Tested `D:\face2.png` against the enrolled embedding for employee `1`.
- Verified: Recognition returned employee `1` with confidence `0.8948`.
- Pending: Add frontend camera/enrollment flows and connect successful recognition to attendance marking.

## Entry Template
```markdown
## YYYY-MM-DD — Short session title
- Completed:
- Changed:
- Verified:
- Pending:
```
