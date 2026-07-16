# Project Context

Last updated: 2026-07-16

## Product

- Name: Face Attendance
- Objective: Multi-tenant school attendance SaaS using class-scoped face-recognition sessions and parent WhatsApp notifications.
- Active domain model: organizations/schools, portal users, classes, students, attendance sessions, attendance marks, face embeddings, and WhatsApp logs.
- Legacy employee routes remain for migration compatibility but are not part of the active school workflow.

## Architecture

| Service | Stack | Deployment |
|---|---|---|
| `face-attendance/frontend` | Next.js 16, React 19, strict TypeScript, Tailwind | Vercel frontend (`face-detector-seven.vercel.app`) |
| `face-attendance/backend` | FastAPI, async SQLAlchemy, Alembic, Neon PostgreSQL | Vercel backend (`face-detector-k4dl.vercel.app`) |
| `face-attendance/ai-service` | FastAPI, DeepFace ArcFace, RetinaFace/OpenCV, TensorFlow | Hugging Face Docker Space (`abdullah017-face-attendance-ai.hf.space`) |

The browser calls the same-origin Next.js route `/api/backend/*`; that route proxies to `BACKEND_INTERNAL_URL`. The backend is the only caller of the AI service and authenticates with `X-API-Key`.

## Current Release Candidate

- Authentication uses a short-lived signed JWT in a Secure, HttpOnly cookie plus a double-submit CSRF cookie. Bearer JWTs remain supported for non-browser clients. The frontend does not persist tokens or users in `localStorage`.
- JWTs validate issuer, audience, expiry, not-before, issued-at, ID, token type, tenant, and subject claims. Login is organization-specific and rate limited. Production public signup and API docs default to disabled.
- Every protected request reloads the active user and active company and validates tenant membership. Portal emails are unique per organization, so the same email may exist in different organizations as separate tenant user rows.
- Organization admins manage admin/HR/branch-manager/viewer accounts. Deactivation is reversible; permanent deletion is separate and preserves historical foreign-key integrity.
- Attendance is class/session based. Staff explicitly turn a class session ON/OFF. A kiosk scan can create one `present` mark per student per active session; repeat scans are idempotent and never check a student out.
- There is no time-triggered attendance, 9 AM rule, absent cron, or automatic absent-row creation. Manual attendance corrections support present, absent, and excused for admin/HR/branch-manager roles; viewers are read-only.
- Latest Alembic head is `c1d4e7f9a620_one_attendance_mark_per_session`. It adds a partial unique index on `(session_id, student_id)` after removing historical duplicates. The current Neon database was last observed at `a7e2d5c8f310`; apply the new migration during release.
- New face embeddings are encrypted at rest with `BIOMETRIC_ENCRYPTION_KEY`. Recognition excludes embeddings created by another model. Run `python -m app.encrypt_face_embeddings` only after confirming the deployment key matches existing encrypted data.
- Organization-specific WhatsApp tokens are encrypted at rest with `CREDENTIAL_ENCRYPTION_KEY`, or a domain-separated key derived from `BIOMETRIC_ENCRYPTION_KEY`. Deploy compatible backend code before running `python -m app.encrypt_company_credentials`.
- WhatsApp webhook POSTs require Meta HMAC signatures in production. Inbound IDs are deduplicated. Parent lookup fails closed when a shared fallback number is ambiguous across tenants.
- AI defaults: ArcFace, RetinaFace primary detector, OpenCV/SSD/MTCNN fallbacks, threshold `0.42`, runner-up margin `0.03`, up to three same-person enrollment photos, enrollment flip augmentation, serialized CPU inference, image quality gates, and hard rejection of group photos.
- The Hugging Face Docker image runs as a non-root user and pre-bundles ArcFace and RetinaFace weights. Production requires `AI_API_KEY`.
- Student source photos are optimized in the browser. The backend stores a small JPEG profile thumbnail and an encrypted embedding, not the original enrollment image.
- The kiosk is responsive, class scoped, HTTPS-camera aware, automatically polls session state, and offers separate fresh-photo/upload fallbacks. Its company API key remains a bearer credential and must be rotated if a kiosk URL is exposed.
- Frontend/backend responses include security headers; frontend has a production CSP and HSTS. API responses are non-cacheable. Production startup rejects unsafe origins, secrets, database transport, cookie settings, AI URLs, and invalid encryption keys.
- CI covers backend migrations/tests/audits, frontend typecheck/lint/build/audit, and lightweight AI tests/audits. Dependabot monitors npm, pip, Docker, and GitHub Actions.

## Validation Evidence (2026-07-16)

- Backend: 18 tests pass under pytest 9.1.1; compile and dependency checks pass; production and development requirements have no known vulnerabilities.
- Frontend: strict TypeScript, ESLint, optimized Next.js production build, and npm audit pass with zero findings.
- AI: 6 unit tests pass; production requirements have no known vulnerabilities.
- Final AI Docker image builds successfully with Python 3.10 and exact pinned packages. Health reported ArcFace/RetinaFace ready with API-key enforcement.
- Real-photo container smoke: enrollment returned a 512-dimensional ArcFace vector; a second photo of the same person matched at `0.59` with threshold `0.42`.
- Clean PostgreSQL 16 smoke: every migration applied through `c1d4e7f9a620`, and `alembic check` reported no schema drift.
- Real Neon auth smoke: demo login set session/CSRF cookies, `/auth/me` returned 200, CSRF logout returned 204, and cookies cleared.
- Next.js proxy smoke: health, login, Set-Cookie forwarding, authenticated `/auth/me`, CSRF forwarding, and logout all passed through `/api/backend`.
- Secret scan found no tracked `.env` files or obvious committed credentials.

## Release Order

1. Confirm Vercel and Hugging Face environment variables listed in `face-attendance/README.md`. Rotate any credential previously pasted into chat or screenshots.
2. Push the Hugging Face checkout in `hf-face-attendance-ai` and confirm `/health` reports model ready, threshold `0.42`, and API-key protection.
3. Push/deploy the GitHub monorepo changes and confirm backend `/health` and `/ready` plus frontend login.
4. From `face-attendance/backend`, run `python -m alembic upgrade head` against Neon and confirm `python -m alembic current` reports `c1d4e7f9a620`.
5. Run `python -m app.encrypt_company_credentials`. Run `python -m app.encrypt_face_embeddings` only after key verification.
6. Re-enroll any Facenet or plaintext demo faces under ArcFace, start one class session, and perform one real kiosk scan.
7. Send one real inbound WhatsApp `STATUS` message and verify inbound, reply, and delivery/read callback rows.

## External Acceptance / Production Limits

- Meta account/business restrictions, approved templates, test-recipient limits, and the real 24-hour customer-service window are external to this codebase.
- Free Hugging Face CPU hardware can sleep and serves one serialized inference at a time; paid or dedicated compute is required for strict uptime/high throughput.
- Static image fallback is convenient for testing but is spoofable. Enable and validate liveness/anti-spoofing before unattended high-stakes deployment.
- Before collecting real student biometrics, define school consent, retention, deletion, breach response, WhatsApp opt-in, operator audit, and applicable legal requirements.
- In-process rate limiting is suitable for the current test deployment; multi-instance production should use a shared rate-limit store and stronger kiosk device registration.

## Commands

| Task | Command (run from the listed service) |
|---|---|
| Frontend dev | `npm.cmd run dev` |
| Frontend checks | `npm.cmd run typecheck`; `npm.cmd run lint`; `npm.cmd run build`; `npm.cmd audit --audit-level=high` |
| Backend dev | `.\\.venv\\Scripts\\python.exe -m uvicorn main:app --reload --port 8000` |
| Backend checks | `.\\.venv\\Scripts\\python.exe -m pytest -q`; `.\\.venv\\Scripts\\python.exe -m pip check`; `.\\.venv\\Scripts\\python.exe -m pip_audit -r requirements-dev.txt` |
| Migrations | `.\\.venv\\Scripts\\python.exe -m alembic upgrade head`; `.\\.venv\\Scripts\\python.exe -m alembic check` |
| Seed demo | `.\\.venv\\Scripts\\python.exe -m app.seed` |
| Reset demo (destructive) | `.\\.venv\\Scripts\\python.exe -m app.reset_demo_data` |
| Add demo data | `.\\.venv\\Scripts\\python.exe -m app.add_demo_data` |
| AI dev | `.\\.venv\\Scripts\\python.exe -m uvicorn main:app --reload --port 8001` |
| AI tests | `.\\.venv\\Scripts\\python.exe -m pytest -q` |
| AI image | `docker build -t face-attendance-ai .` |

## Memory Rules

- Repository files are the canonical context across agents and IDEs.
- Never put secrets, tokens, real face vectors, personal phone numbers, or student data in memory files.
- Update this file, `docs/SESSION_LOG.md`, and `docs/DECISIONS.md` after meaningful architecture or release changes.
