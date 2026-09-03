# Project Context

Last updated: 2026-09-04

## Product

- Name: Face Attendance
- Objective: Multi-tenant school attendance SaaS using class-scoped face-recognition sessions, FCM push notifications for arrival/checkout, and weekly email reports for students, staff, and HR/managers.
- Active domain model: organizations/schools, portal users, classes, students, employees (teachers and staff), attendance sessions, attendance marks, and face embeddings.
- Teachers and staff mirror the student experience: face enrollment (AI key `e{employee_id}`), kiosk check-in/check-out, and a Staff Attendance page (today, history, manual edit, CSV export). Their check-in/check-out alerts are sent via FCM/Emails. Staff absences are not auto-created or notified; the attendance session is shared with students. Each employee has an optional `expected_arrival_time` (drives on-time/late check-in classification) and an optional `expected_departure_time`.

## Architecture

| Service | Stack | Deployment |
|---|---|---|
| `face-attendance/frontend` | Next.js 16, React 19, strict TypeScript, Tailwind | Vercel frontend (`face-detector-seven.vercel.app`) |
| `face-attendance/backend` | FastAPI, async SQLAlchemy, Alembic, Neon PostgreSQL | Vercel backend (`face-detector-k4dl.vercel.app`) |
| `face-attendance/ai-service` | Python 3.11, FastAPI, DeepFace ArcFace, RetinaFace/OpenCV, TensorFlow | Hugging Face Docker Space (`abdullah017-face-attendance-ai.hf.space`) |

The browser calls the same-origin Next.js route `/api/backend/*`; that route proxies to `BACKEND_INTERNAL_URL`. The backend is the only caller of the AI service and authenticates with `X-API-Key`.

## Current Release Candidate

- Authentication uses a short-lived signed JWT in a Secure, HttpOnly cookie plus a double-submit CSRF cookie. Bearer JWTs remain supported for non-browser clients. The frontend does not persist tokens or users in `localStorage`.
- JWTs validate issuer, audience, expiry, not-before, issued-at, ID, token type, tenant, and subject claims. Login is organization-specific and rate limited. Production public signup and API docs default to disabled.
- Every protected request reloads the active user and active company and validates tenant membership. Portal emails are unique per organization, so the same email may exist in different organizations as separate tenant user rows.
- Organization admins manage admin/HR/branch-manager/viewer accounts. Deactivation is reversible; permanent deletion is separate and preserves historical foreign-key integrity.
- Attendance is class/session based with two global session types per company: `check_in` and `check_out`. Staff explicitly turn a session ON/OFF, or use the one-click Dashboard Launch which starts the session and opens the kiosk in a new tab (returns the company `api_key`). A kiosk scan can create one `present` mark per student/employee per active session; repeat scans are idempotent and never check a subject out.
- A Vercel cron (`/attendance/cron/end-sessions`, once/day on Hobby) ends sessions past their `session_end_time` and, for `check_in` sessions, creates `absent` rows plus parent absent alerts for students not yet checked in. Staff absences are NOT auto-created or notified. Kiosk queries treat a session as ended immediately once `session_end_time` passes (lazy expiry), so the dashboard reflects it without waiting for the cron. Manual attendance corrections support present, absent, and excused for admin/HR/branch-manager roles; viewers are read-only.
- Latest Alembic head is `h2i3j4k5l6m7_add_expected_departure_time`. The chain includes `8b0ac05d29be_add_employee_attendance` (nullable `employee_id` FKs on `attendance`, `face_embeddings`, `whatsapp_logs`; `student_id` made nullable), `g1h2i3j4k5l6`/`h2i3j4k5l6m7` (company `check_in_end_time`/`check_out_end_time` and employee `expected_arrival_time`/`expected_departure_time`), and `d1b70a2ff4a5_merge_heads`. `alembic check` reports no schema drift.
- The school WhatsApp number is editable from the Dashboard WhatsApp card by admin/super-admin users (`PUT /companies/{id}/settings` with `school_phone`); WhatsApp credentials remain platform-managed environment variables.
- New face embeddings are encrypted at rest with `BIOMETRIC_ENCRYPTION_KEY`. Recognition excludes embeddings created by another model. Run `python -m app.encrypt_face_embeddings` only after confirming the deployment key matches existing encrypted data.
- WhatsApp credentials are platform-managed backend environment variables (`META_WHATSAPP_TOKEN` and `META_PHONE_NUMBER_ID`) shared by every organization. Organization settings cannot read, select, or override them; legacy company credential columns are ignored.
- WhatsApp webhook POSTs require Meta HMAC signatures in production. Inbound IDs are deduplicated. With the shared number, parent lookup resolves an organization only when the parent/student relationship is unambiguous and otherwise fails closed.
- AI defaults: ArcFace, RetinaFace primary detector, OpenCV/SSD/MTCNN fallbacks, threshold `0.42`, runner-up margin `0.03`, up to three same-person enrollment photos, enrollment flip augmentation, serialized CPU inference, image quality gates, and hard rejection of group photos.
- The Hugging Face Docker image runs as a non-root Python 3.11 user, pins patched Keras 3.15.0, and pre-bundles ArcFace and RetinaFace weights. Production requires `AI_API_KEY`.
- Student source photos up to 50 MB are compressed in the browser before upload. Up to three pending enrollment samples append until explicitly removed. Profile photos are independent and remain unchanged during face updates/unenrollment unless the user explicitly replaces or removes them. The backend stores one small JPEG profile thumbnail and an encrypted aggregate embedding, not original enrollment images.
- The kiosk is responsive, class scoped, HTTPS-camera aware, automatically polls session state, and offers separate fresh-photo/upload fallbacks. Its company API key remains a bearer credential and must be rotated if a kiosk URL is exposed.
- Frontend/backend responses include security headers; frontend has a production CSP and HSTS. API responses are non-cacheable. Production startup rejects unsafe origins, secrets, database transport, cookie settings, AI URLs, and invalid encryption keys.
- CI covers backend migrations/tests/audits, frontend typecheck/lint/build/audit, and lightweight AI tests/audits. Dependabot monitors npm, pip, Docker, and GitHub Actions.
- **Platform Admin Control Plane (2026-09-04)**: Dedicated operator interface (`/admin/*` frontend, `/platform-admin/*` backend) authenticated via `PLATFORM_ADMIN_KEY` env var secret with isolated cookie sessions (`face_attendance_platform_session`). Provides cross-organization monitoring (total orgs, students, staff, portal users, today's scans, active kiosks), individual org detail drill-down (complete student, staff, user, and class lists), and instant organization status toggling (`active` ↔ `suspended`). Suspended orgs immediately fail tenant portal logins and reject kiosk API scans.

## Tenant Security and Client UX (2026-07-17)

- Portal user creation is locked to the authenticated organization. The frontend does not offer or submit an organization selector, and the backend rejects any attempted `company_id` override.
- User listing, activation, deactivation, role changes, permanent deletion, company settings, API keys, and class access are always constrained by the authenticated `company_id`, including for `super_admin` accounts. Cross-organization identifiers return `404` to limit tenant enumeration.
- Organization admins cannot manage a `super_admin`, cannot alter their own role/status, and cannot delete themselves. User input schemas reject unknown privilege-bearing fields.
- Dashboard workflows now use accessible confirmation dialogs, retryable API errors, safer destructive-action labels, responsive mobile cards, clearer empty states, camera/upload guidance, and non-localhost production API defaults.
- Settings is intentionally kiosk-only: it contains the class-scoped kiosk workflow, link generator, open/copy actions, and key-rotation warning. The school phone used for staff alerts is editable from the Dashboard WhatsApp card, not the Settings page; WhatsApp diagnostics, test-message controls, and raw kiosk-key display do not belong on the organization Settings page.
- Login uses a project-owned generated school-kiosk illustration at `frontend/public/images/login-attendance-hero.png`. The page is a responsive split layout on desktop and a compact visual banner plus form on mobile, with phone-specific hero height, typography, input spacing, and footer wrapping plus accessible password visibility, loading, error, security, and legal controls.
- The project logo is stored at `frontend/public/images/face-attendance-logo.png`. A shared responsive `BrandLogo` component is used on authentication, navigation, kiosk, and legal screens; Next.js serves matching browser and Apple icons from `frontend/src/app/icon.png` and `frontend/src/app/apple-icon.png`.
- Verification: 41 backend tests pass, frontend strict TypeScript and ESLint pass, the optimized Next.js production build succeeds, and `git diff --check` reports no patch errors.

## Validation Evidence (2026-07-16)

- Backend: 18 tests pass under pytest 9.1.1; compile and dependency checks pass; production and development requirements have no known vulnerabilities.
- Frontend: strict TypeScript, ESLint, optimized Next.js production build, and npm audit pass with zero findings.
- AI: 6 unit tests pass; production requirements have no known vulnerabilities.
- The Python 3.11 Linux dependency graph resolves with Keras 3.15.0 and passes `pip-audit`; this replaces the vulnerable Python-3.10-compatible Keras line found by the first CI run.
- Final AI Docker image builds successfully with Python 3.11 and exact pinned packages. Health reported ArcFace/RetinaFace ready with API-key enforcement.
- Real-photo container smoke: enrollment returned a 512-dimensional ArcFace vector; a second photo of the same person matched at `0.59` with threshold `0.42`.
- Clean PostgreSQL 16 smoke: every migration applied through `c1d4e7f9a620`, and `alembic check` reported no schema drift.
- Real Neon auth smoke: demo login set session/CSRF cookies, `/auth/me` returned 200, CSRF logout returned 204, and cookies cleared.
- Next.js proxy smoke: health, login, Set-Cookie forwarding, authenticated `/auth/me`, CSRF forwarding, and logout all passed through `/api/backend`.
- Secret scan found no tracked `.env` files or obvious committed credentials.

## Live Rollout Status (2026-07-17)

- Main commit `adbe6c7` is pushed; GitHub CI passes, Vercel serves the hardened frontend/backend, backend `/ready` reports database/AI/encryption ready, and production cookie login/auth-me/logout passes.
- Hugging Face commit `d20eb84` is running on CPU Basic with the Python 3.11/Keras security fix. Live health reports ArcFace ready, RetinaFace, threshold `0.42`, margin `0.03`, and API-key enforcement.
- Neon is at Alembic head `h2i3j4k5l6m7`. The credential conversion found no plaintext company credentials; the one ArcFace embedding was encrypted and its legacy JSON value is null.

## Release Order

1. Confirm Vercel uses the same `BIOMETRIC_ENCRYPTION_KEY` that encrypted the Neon record; preserve that key in a secure backup.
2. Apply migration `8b0ac05d29be` to Neon before deploying the new backend code.
3. Start one class session and perform one real kiosk scan plus a repeat-scan idempotency check. Re-enroll with two or three clear photos if recognition quality is weak.
4. Enroll one teacher/staff face, scan at the kiosk, and confirm a staff check-in row plus an alert to the school manager/HR.
5. Direct users to install the Progressive Web App (PWA) on mobile/tablet devices via the browser install banner or sidebar button.
6. When WhatsApp work resumes, send one real inbound `STATUS` message and verify inbound, reply, and delivery/read callback rows.

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
