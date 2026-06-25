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

## 2026-06-25 — Phase 2 authentication
- Completed: Added Supabase-compatible database configuration, JWT security helpers, `/auth/login`, `/auth/me`, authenticated dependencies, tenant-filtered APIs, Axios interceptors, AuthContext, login UI, route protection, and Phase 2 seed.
- Changed: Renamed the initial migration to `initial_tables` while preserving its revision ID and history.
- Verified: Alembic reports no schema drift; password/JWT helpers pass; unauthenticated `/auth/me` returns 401; authenticated login/me work; frontend type-check, lint, and production build pass.
- Pending: Replace the preserved Neon URL in `backend/.env` with actual Supabase credentials and apply the existing migration there.

## 2026-06-25 — Neon confirmed for Phase 2
- Completed: Restored Neon as the canonical managed PostgreSQL provider.
- Changed: Updated the backend environment template, README, architecture context, and decision log while preserving Phase 2 JWT authentication.
- Verified: The configured database host is Neon, database is `neondb`, and SSL mode is enabled.
- Pending: Continue Phase 2 on the existing Neon database; no provider migration is required.

## 2026-06-25 — Organization signup
- Completed: Added public organization signup that transactionally creates a starter company and its first administrator.
- Changed: Added `/auth/signup`, typed Axios signup support, `/signup` UI, automatic login, and login/signup navigation.
- Verified: Signup returns 201 and a JWT, `/auth/me` accepts the token, duplicate email returns 409, frontend type-check/lint/build pass, and integration-test records were removed afterward.
- Pending: Add email verification, abuse protection, and production password policy controls.

## 2026-06-25 — Next.js 16 upgrade
- Completed: Upgraded the frontend from Next.js 14/React 18 to Next.js 16.2.9/React 19.2.7.
- Changed: Migrated from `next lint` and legacy `.eslintrc` to ESLint 9 flat configuration; accepted Next.js 16 TypeScript defaults.
- Verified: ESLint, strict TypeScript, Turbopack production build, backend `/auth/signup`, and transactional signup integration all pass.
- Environment: Local frontend now targets backend port 8002 because an unresolvable orphaned Windows listener occupies port 8000.
- Pending: Monitor the two moderate transitive PostCSS advisories bundled through the current stable Next.js release.

## Entry Template
```markdown
## YYYY-MM-DD — Short session title
- Completed:
- Changed:
- Verified:
- Pending:
```
