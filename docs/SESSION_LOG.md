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

## 2026-06-27 — Phase 3 employee management and face enrollment
- Completed: Added tenant-scoped employee CRUD, department support, soft delete, DB-backed face enrollment routes, default branch bootstrap, AI-service embedding extraction/comparison contract, employee management UI, webcam enrollment modal, and enrollment dashboard stats.
- Changed: Added `face_embeddings`, migration `4bb92f37879c_employee_department_face_embeddings`, `AI_SERVICE_URL`, `httpx`, `react-webcam`, Radix Dialog/Label primitives, and README updates.
- Verified: Applied Alembic migration to Neon, ran seed, backend smoke tested login/employee CRUD/enrollment-status with cleanup, AI service import passed, backend and AI Python compile passed, Alembic check reports no drift, frontend typecheck/lint/build pass.
- Pending: Run a full webcam enrollment against live backend + AI service, add recognition-to-attendance flow, and design production biometric encryption/consent/retention controls.

## 2026-06-27 — Dummy demo data
- Completed: Extended the backend seed to create 8 dummy employees, today's attendance rows, and 4 synthetic placeholder face enrollment rows for frontend UI testing.
- Changed: Updated seed email domains to valid addresses and migrated the initial `@demo.local` rows created during this session to valid demo addresses.
- Verified: Ran seed against Neon, authenticated as the demo admin, confirmed 8 new demo employees and 4 enrolled placeholders are visible through `GET /employees`, reran seed to confirm idempotency, and compiled backend Python files.
- Pending: Replace placeholder enrollment rows by enrolling real consented test images through the webcam flow when testing biometric behavior.

## 2026-06-27 — Security and quality updates from code review
- Completed: Implemented missing audit timestamps on 4/6 models, migrated to PyJWT and DeclarativeBase, added slowapi rate limiting to auth endpoints, API key check in AI service, and offset pagination on employee/attendance list endpoints.
- Changed: Updated models to use `created_at/updated_at`, altered employee email constraint to be tenant-scoped `(company_id, email)`, injected httpx AsyncClient from lifespan in backend, replaced python-jose with PyJWT, fixed frontend login form for enter key submission, added global Next.js error boundary, and replaced stub Reports/Settings pages.
- Verified: Ran Alembic autogenerate, applied migration 9428e714984a successfully, installed new pip dependencies (slowapi, PyJWT, cryptography), and validated Next.js frontend fixes.
- Pending: Design production biometric encryption, connect recognition-to-attendance flow.

## 2026-06-28 — Phase 3 gap fixes
- Completed: Fixed the reviewed Phase 3 gaps: env-driven AI-service API key, tenant-scoped employee email update check, frontend fetch-all pagination helpers, dashboard/table headshot rendering, and immediate headshot update after webcam enrollment.
- Changed: Added `AI_API_KEY` to environment examples, made backend require/send `settings.ai_api_key`, made AI service require `AI_API_KEY`, switched frontend dashboard/employees/attendance pages to fetch all pages, and rendered `EmployeeAvatar` in dashboard and employee table.
- Verified: Backend compile, AI-service compile, Alembic drift check, frontend typecheck, frontend lint, frontend production build, backend login/employees/attendance smoke, and AI-service API-key function check all pass.
- Pending: Manual browser webcam enrollment against live services and production biometric storage/compliance design.

## 2026-06-28 — Uploaded photo enrollment
- Completed: Added an existing-photo upload option to the face enrollment modal alongside webcam capture.
- Changed: The modal now accepts image files, validates file type and 2 MB max size, previews the uploaded image, and sends the full data URL to preserve MIME type for stored headshots.
- Verified: Frontend typecheck, lint, and production build pass.
- Pending: Manual browser enrollment test with a real consented image while backend and AI service are running.

## 2026-06-28 — Optional face enrollment during employee creation
- Completed: Added optional face-photo upload to the Add/Edit Employee modal.
- Changed: Creating or updating an employee can now also enroll a face photo in the same modal; Branch field label now clarifies it expects an optional numeric Branch ID and can be left blank for Main Branch.
- Verified: Frontend typecheck, lint, and production build pass.
- Pending: Manual add-employee-with-photo test while backend and AI service are running.

## 2026-06-28 â€” Create-employee face enrollment retry
- Completed: Diagnosed create-employee face enrollment and confirmed backend plus AI service are healthy.
- Changed: The Add/Edit Employee modal now keeps the already-created employee open when face enrollment fails, locks profile fields, shows the specific enrollment error, and allows retrying face enrollment without creating a duplicate employee.
- Verified: AI-service `/enroll` accepted the local test image, backend login/create/enroll/status succeeded with a temporary employee and cleanup, and frontend typecheck, lint, and production build pass.
- Pending: Browser retest with the user's selected upload while both backend and AI service are running.

## 2026-06-28 - Enrolled face UI cleanup
- Completed: Removed misleading inline face upload from the Edit Employee modal when the employee already has a face enrolled.
- Changed: Enrolled employee rows now show `Update Face` instead of `Enroll Face`, and the face modal/toasts use update wording when replacing an existing enrollment.
- Verified: Frontend typecheck, lint, production build, and diff whitespace check pass.
- Pending: Browser retest after refreshing the running Next.js dev server.

## 2026-06-28 - Phase 4 live kiosk and user management
- Completed: Added role-gated portal user management, company API-key kiosk authentication, live auto-mark attendance endpoint, attendance today/history/export APIs, standalone kiosk page, Users page, attendance tabs, conditional sidebar Users link, and Settings kiosk setup.
- Changed: Added `companies.api_key`, `users.is_active`, `users.last_login`, migration `b7c4d9e8f012_phase_4_user_management_kiosk`, and backend role dependencies for dashboard APIs.
- Verified: Applied migration to Neon, backend compile passes, Alembic check reports no drift, in-process backend smoke tests pass for login/users/company key/attendance today/history, invalid kiosk key returns 401, and frontend typecheck/lint/production build pass.
- Pending: Manual browser kiosk test with live backend + AI service and real enrolled employees; replace default late-detection shift constants with real shift management.

## 2026-06-28 - User reactivation
- Completed: Added a backend user reactivation endpoint and frontend Activate action for inactive portal users.
- Changed: `/users/{id}/activate` sets `is_active = true`; the Users table now shows Activate for inactive users and Deactivate for active users.
- Verified: Backend compile, frontend typecheck/lint/build, and an in-process create/deactivate/activate/cleanup smoke test pass.
- Pending: Browser retest on the Users page after refreshing the Next.js dev server.

## 2026-06-28 - Kiosk organization name
- Completed: Added organization name display to the standalone kiosk header.
- Changed: Added `GET /companies/kiosk-info` using `X-API-Key`, frontend kiosk metadata fetch, and branch number display in the kiosk header.
- Verified: Backend compile, frontend typecheck/lint/build, valid kiosk-info smoke test, and invalid kiosk key 401 smoke test pass.
- Pending: Browser retest with a copied kiosk URL from Settings.

## 2026-06-28 - Mobile local login setup
- Completed: Configured local same-Wi-Fi mobile testing so phone browsers call the PC backend instead of phone-local `localhost`.
- Changed: Added env-driven backend `FRONTEND_ORIGINS`, allowed `http://192.168.0.116:3000`, changed local frontend API URL to `http://192.168.0.116:8002`, and documented LAN run commands.
- Verified: Backend compile, frontend typecheck/lint, and CORS preflight for `http://192.168.0.116:3000` pass.
- Pending: Start backend/frontend with `--host 0.0.0.0` and confirm login from the phone browser.

## 2026-06-28 - Mobile login runtime fix
- Completed: Diagnosed the mobile login hang as the backend still listening on `127.0.0.1:8002` instead of the LAN interface.
- Changed: Restarted the local backend with `--host 0.0.0.0 --port 8002` and restarted the Next.js dev server with `-H 0.0.0.0` so it picks up the LAN API URL.
- Verified: `http://192.168.0.116:8002/health` returns ok, `http://192.168.0.116:3000/login` returns 200, mobile-origin CORS preflight to `/auth/login` returns 200, LAN `/auth/login` returns a normal 401 for invalid credentials, and frontend typecheck/lint pass.
- Pending: Confirm login directly from the phone browser at `http://192.168.0.116:3000`.

## 2026-06-28 - Frontend mobile responsiveness pass
- Completed: Made the dashboard shell and core Phase 4 screens more usable on mobile.
- Changed: Added mobile top navigation with a slide-out drawer, reduced mobile page padding/headings, made tables horizontally scroll with minimum widths, stacked modal actions on small screens, and improved kiosk header/result layout on phones.
- Verified: Frontend typecheck and lint pass.
- Pending: Manual browser check on a physical phone for dashboard, employees, users, settings, and kiosk camera permission flow.

## 2026-06-28 - Mobile kiosk, copy fallback, and admin users access
- Completed: Addressed reported mobile kiosk camera, Settings copy button, and admin Users visibility issues.
- Changed: Added kiosk camera error messaging plus `Capture/Upload Photo` fallback for local HTTP mobile testing, Clipboard API fallback with manual-select support, explicit `NEXT_PUBLIC_KIOSK_BASE_URL`, normalized frontend/backend admin role checks, and restarted frontend/backend dev servers.
- Verified: Frontend typecheck/lint, backend compile, backend smoke test for capitalized `Admin` role accessing `/users`, `/login` page load, `/kiosk` page load, and LAN backend health all pass.
- Pending: Manual phone test of Settings copy, `/users` link as an admin, and kiosk photo fallback; true live mobile camera requires HTTPS frontend plus HTTPS API/proxy.

## 2026-06-29 - Phase 5 student system and WhatsApp notifications
- Completed: Pivoted the active product model from employee attendance to school student attendance with WhatsApp parent notifications.
- Changed: Added `students`, `whatsapp_logs`, school WhatsApp settings, `attendance.student_id`, `face_embeddings.student_id`, migration `a0ddfb82a57e_student_whatsapp_system`, `/students`, `/whatsapp/*`, student face enrollment, `/students/import`, student dashboard/attendance/kiosk UI, `/notifications`, and WhatsApp configuration in Settings.
- Verified: Applied Alembic migration to Neon, backend compile passes, Alembic check reports no drift, demo school seed runs, authenticated smoke tests pass for `/students`, `/attendance/today`, `/whatsapp/stats`, and school settings, and frontend typecheck/lint/build pass.
- Pending: Manual WhatsApp test with real Meta credentials, manual mobile HTTPS kiosk test with real enrolled students, and compliance review for parent opt-in, WhatsApp retention, biometric consent, and encrypted secret/embedding storage.

## 2026-06-29 - Organization-specific portal login
- Completed: Added organization/school name to the portal login flow.
- Changed: `/auth/login` now requires `organization_name` and validates the email/password against a matching active company; the frontend login page now asks for Organization / School name before email and password.
- Verified: Backend compile, frontend typecheck, frontend lint, valid demo login with `Demo School`, and wrong-organization login rejection all pass.
- Pending: Consider replacing exact organization-name matching with immutable school slugs or subdomains before production.

## 2026-06-29 - Tenant-scoped portal user emails
- Completed: Allowed one email address to belong to different organizations.
- Changed: Added migration `f4b9c2d1e8a7_tenant_scoped_user_email`, changed `users.email` from globally unique to unique per `(company_id, email)`, removed global signup email blocking, and updated user-management duplicate checks to be organization-scoped.
- Verified: Applied migration to Neon, backend compile passes, Alembic check reports no drift, same-email login works in two different temporary organizations, wrong password still fails, and live backend/frontend/AI health checks pass after backend restart.
- Pending: Consider a dedicated global account plus organization-membership model before production.

## 2026-07-03 - Class-wise attendance sessions
- Completed: Added class-wise start/stop attendance sessions.
- Changed: Added `attendance_sessions`, `attendance.session_id`, migration `d2a7c9e4b631_class_attendance_sessions`, session list/status/start/stop API endpoints, active-session enforcement in kiosk auto-marking, class filter/session controls on `/attendance`, and a kiosk stopped-session result.
- Verified: Applied migration to Neon, backend compile passes, Alembic check reports no drift, frontend typecheck/lint/build pass, start/duplicate/stop session smoke tests pass, kiosk auto-mark is blocked when the class session is stopped, and live backend/frontend/AI health checks plus proxy login pass after restart.
- Pending: Add real timetable/period configuration, session audit views, and role rules for which staff can control each class.

## 2026-07-03 - Frontend API validation error rendering fix
- Completed: Fixed the React runtime crash caused by rendering FastAPI validation detail objects directly.
- Changed: Added a shared frontend API error formatter that converts string, object, and array validation details into safe text, then replaced unsafe auth/modal error handling paths.
- Verified: Frontend typecheck, lint, production build, `/attendance` page load, and frontend proxy health pass after restarting the frontend dev server.
- Pending: Consider wiring field-level validation messages in forms instead of only showing summary text.

## 2026-07-03 - Portal user management cleanup
- Completed: Fixed portal user lifecycle issues around login after deactivation, recreating deleted users, and permanent removal.
- Changed: Creating a user with an inactive same-organization email now reactivates and updates that user, added `DELETE /users/{id}/permanent`, added a Users table Remove action with confirmation, surfaced action-specific API errors, and allowed organization admins to assign tenant-level admin users.
- Verified: Backend compile passes, frontend typecheck/lint/build pass, live API smoke test passes for create admin user, login, deactivate, rejected inactive login, recreate/reactivate same email, login with new password, permanent removal, and list removal.
- Pending: Add automated authorization tests for portal user lifecycle and role assignment.

## 2026-07-03 - Organization-aware user login troubleshooting
- Completed: Diagnosed organization-specific login failure as a user account belonging to a different organization than the organization name entered on the login screen.
- Changed: Added super-admin organization visibility in the Users table, organization selection in Add User, password reset support in Edit User, and switched this workstation's clean backend/frontend proxy path to backend port 8003 because port 8002 was serving stale code from unkillable Windows listeners.
- Verified: Backend compile passes, frontend typecheck/lint/build pass, clean backend OpenAPI exposes `UserUpdate.password`, frontend proxy health works through port 8003, and live password-reset smoke test passes.
- Pending: Add invite/email-reset flow and automated tests for organization-specific login and password reset before production.

## 2026-07-06 - WhatsApp Cloud API verification
- Completed: Verified WhatsApp Cloud API sending with configured backend credentials.
- Changed: Updated local frontend proxy/backend port from 8003 to 8004 because 8003 was occupied by a stale Windows listener.
- Verified: Meta `hello_world` template send returned an accepted message ID, backend `/whatsapp/test` returned success with a message ID, backend health passed on port 8004, and frontend `/api/backend/health` proxy works through port 8004.
- Pending: Add WhatsApp webhook support and template-based production attendance messages before production.

## 2026-07-06 - Face recognition accuracy pass
- Completed: Improved the AI service recognition pipeline for stricter, higher-quality matching.
- Changed: Switched local/default model from Facenet to ArcFace, added blur/brightness/resolution/face-size validation, added original+horizontal-flip embedding averaging, added best-vs-runner-up ambiguity margin, exposed model/detector in AI health, and saved the actual AI model name on face enrollment.
- Verified: Backend compile passes, AI service compile passes, AI service health reports `ArcFace` with `retinaface`, and a margin logic smoke test shows clear matches separated from near-tie matches.
- Pending: Re-enroll existing students to replace old Facenet/demo embeddings with ArcFace embeddings, then manually test kiosk recognition with real faces and tune `RECOGNITION_THRESHOLD`/`RECOGNITION_MARGIN`.

## 2026-07-06 - Clean Demo School data reset
- Completed: Removed old development tenant/test data and recreated a clean dataset under the demo admin account.
- Changed: Added `python -m app.reset_demo_data`, which preserves Demo School settings/API key/WhatsApp settings, deletes old companies/users/students/attendance/sessions/logs/embeddings, recreates `admin@demo.com`, 3 classes, 8 students, today's attendance rows, and no face embeddings.
- Verified: Reset script ran successfully, admin login works, only one company remains (`Demo School`), `/students` returns 8 records, `/attendance/today` returns 8 records, `/attendance/sessions` returns 2 records, `/users` returns one admin user, enrolled face count is 0, and frontend proxy health works.
- Pending: Re-enroll real student faces with ArcFace before kiosk recognition testing.

## 2026-07-07 - HuggingFace AI deployment and Vercel Cron absent alerts
- Completed: Added HuggingFace Spaces Docker deployment files for `ai-service` and replaced the backend's in-process APScheduler absent alert job with cron-callable endpoints.
- Changed: Added `ai-service/Dockerfile`, `ai-service/README.md`, pinned AI dependencies, model warmup, optional AI API-key enforcement, backend `/api/cron/absent-alerts`, Vercel cron config, optional backend AI-key forwarding, and `CRON_SECRET`/`APP_ENV` env examples.
- Verified: Backend and AI changed Python files pass no-bytecode syntax parsing, backend imports successfully, no APScheduler references remain, and the HuggingFace Space repo received the Docker deployment files.
- Pending: Wait for the HuggingFace Docker build to complete, set backend `AI_SERVICE_URL` to the Space URL, add `CRON_SECRET` in the backend Vercel project, and manually trigger `/api/cron/absent-alerts` once before relying on the daily schedule.

## 2026-07-07 - HuggingFace Docker package fix
- Completed: Fixed the first HuggingFace Docker build failure caused by outdated Debian package names.
- Changed: Replaced `libgl1-mesa-glx` with `libgl1`, replaced `libxrender-dev` with `libxrender1`, added `--no-install-recommends`, and pushed the Dockerfile fix to the Space repo.
- Verified: HuggingFace Space repo push succeeded.
- Pending: Recheck HuggingFace build logs and `/health` after the rebuild.

## 2026-07-07 - WhatsApp webhook verification endpoint
- Completed: Added the Meta WhatsApp webhook verification endpoint required by "Verify and save" in the Meta dashboard.
- Changed: Added `GET/POST /webhooks/whatsapp`, added `META_WEBHOOK_VERIFY_TOKEN` to backend settings and `.env.example`, and included the webhook router in FastAPI.
- Verified: Webhook files pass syntax parsing and backend import succeeds with a temporary verify token.
- Pending: Set `META_WEBHOOK_VERIFY_TOKEN` in the backend Vercel project, redeploy backend, then verify the callback URL in Meta.

## 2026-07-07 - Deployment env verification
- Completed: Verified the deployed backend, HuggingFace AI service, WhatsApp webhook verification, and cron secret protection.
- Changed: No code changes.
- Verified: Backend `/health` returns ok, AI `/health` returns ArcFace/RetinaFace, Meta webhook challenge returns the expected challenge, and `/api/cron/absent-alerts` rejects an invalid bearer token with 401.
- Pending: Verify real WhatsApp absent/check-in messages with an approved template or an active 24-hour customer-service window.

## 2026-07-07 - WhatsApp completion pass
- Completed: Closed the main WhatsApp production gaps after webhook/cron setup.
- Changed: Added optional template-based sending for check-in, check-out, and absent alerts; added Meta webhook status persistence for sent/delivered/read/failed callbacks; updated WhatsApp stats to count delivered/read as successful; and documented template env variables.
- Verified: Backend WhatsApp-related files pass syntax parsing and backend imports successfully.
- Pending: Create/approve matching templates in Meta, set template env names in backend Vercel, redeploy backend, and run a real recipient test.

## 2026-07-07 - Production login diagnosis
- Completed: Diagnosed demo production login failure.
- Changed: Replaced Passlib password hashing/verification with direct `bcrypt` to avoid production runtime password verification crashes while preserving existing bcrypt hashes.
- Verified: Demo School admin row exists in Neon, `admin123` matches the existing hash locally, wrong passwords are rejected locally, new hashes verify correctly, backend imports successfully, and frontend production proxy `/api/backend/health` still returns 500 until frontend `BACKEND_INTERNAL_URL` is fixed/redeployed.
- Pending: Commit/push backend fix, redeploy backend, set/redeploy frontend `BACKEND_INTERNAL_URL=https://face-detector-k4dl.vercel.app`, then retest production login.

## 2026-07-07 - Post-deploy production check
- Completed: Checked deployed backend, AI service, frontend login page, direct backend demo login, and frontend proxy login.
- Changed: No code changes.
- Verified: Backend `/health` returns ok, HuggingFace AI `/health` returns ArcFace/RetinaFace, frontend `/login` loads, and direct backend `Demo School / admin@demo.com / admin123` login returns a bearer token.
- Pending: Frontend proxy is still failing: `https://face-detector-seven.vercel.app/api/backend/health` returns 500, so frontend Vercel needs `BACKEND_INTERNAL_URL=https://face-detector-k4dl.vercel.app` set in Production and then redeployed.

## 2026-07-08 - Frontend production proxy verified
- Completed: Rechecked the deployed frontend proxy after frontend redeploy/env update.
- Changed: No code changes.
- Verified: `https://face-detector-seven.vercel.app/api/backend/health` returns ok, demo login through the frontend proxy returns a bearer token, and direct backend demo login still returns a bearer token.
- Pending: Log into the mobile browser again and verify the Students page loads authenticated data from localStorage; unauthenticated `/students` API calls correctly return 401.

## 2026-07-08 - Dashboard WhatsApp defaults and class terminology
- Completed: Improved the Dashboard and Settings pages for admin visibility into attendance, face enrollment, and WhatsApp readiness.
- Changed: Settings now shows when the admin account is using default backend WhatsApp credentials, kiosk URLs now use `class_id`, the kiosk displays Class instead of Branch, frontend attendance calls send `class_id`, and backend attendance endpoints accept `class_id` while preserving legacy `branch_id` compatibility.
- Verified: Backend compile/import passes, frontend typecheck/lint pass, and a backend schema smoke test confirms `class_id` request bodies plus Pakistan `03...` phone normalization.
- Pending: Redeploy backend and frontend, then test Settings -> Test WhatsApp with a confirmed Pakistan-format recipient number.

## 2026-07-09 - Frontend proxy empty-body fix
- Completed: Diagnosed the Students page backend-data error as a frontend proxy issue.
- Changed: The Next.js `/api/backend/*` proxy now buffers upstream backend responses into an `ArrayBuffer` before returning them and strips compression-related headers; the generic API error message no longer hardcodes port 8000.
- Verified: Deployed direct backend `/students` returned student JSON, deployed frontend proxy `/api/backend/students` returned an empty body before the fix, and frontend typecheck/lint pass locally after the proxy patch.
- Pending: Commit, push, wait for frontend Vercel redeploy, then retest `/api/backend/students` through the deployed frontend.

## 2026-07-09 - Add student profile photo upload
- Completed: Added the missing image option to the Add/Edit Student modal.
- Changed: The modal now supports optional student profile-photo upload, preview, and removal, persists `profile_image` through existing student create/update APIs, and accepts either Pakistan `92...` or local `03...` parent phone formats client-side.
- Verified: Frontend typecheck and lint pass.
- Pending: Push and wait for frontend Vercel redeploy, then add a student with a photo in production.

## 2026-07-10 - One-step student face enrollment and AI detection tuning
- Completed: Diagnosed first-time face upload as profile-photo-only upload and improved detection failure handling.
- Changed: Add/Edit Student can enroll the uploaded profile photo for attendance recognition, kiosk displays backend/AI detection errors, and AI service applies EXIF orientation correction, detection resizing, fallback detectors, and capped less brittle recognition/quality gates for the current test deployment.
- Verified: Frontend typecheck/lint pass; AI service files pass syntax compilation in both the monorepo and HuggingFace Space checkout.
- Pending: Push monorepo and HuggingFace Space changes, wait for Vercel/HuggingFace redeploys, then test enrollment and kiosk recognition with a clear front-facing photo.

## 2026-07-12 - Production readiness and end-to-end hardening
- Completed: Hardened student images/face enrollment, class-wise attendance, WhatsApp templates/webhooks/chatbot, deployment configuration, dependency security, and repository hygiene.
- Changed: Added encrypted embedding support, Pakistan-time schedules, unique active sessions, Meta signature verification/inbound `STATUS` replies, persisted Meta errors, image optimization, long face timeouts, readiness checks, security headers, pinned backend dependencies, Docker non-root/health setup, tests, and three applied migrations through `a7e2d5c8f310`.
- Verified: Frontend typecheck/lint/build and zero-vulnerability npm audit; 7 backend tests; 2 AI tests; no Alembic drift; student create/update/deactivate cleanup; class session start/stop cleanup; backend-to-AI face enrollment; two-photo ArcFace recognition at 0.6693; Meta accepted the approved WhatsApp test template; no QA rows remain.
- Pending: Deploy GitHub/Hugging Face commits, set new production secrets/variables, encrypt the one legacy embedding, verify a signed inbound `STATUS` webhook, and perform one deployed live-camera kiosk scan.

## 2026-07-12 - Production hardening deployment
- Completed: Pushed Hugging Face commit `07e88ef` and GitHub commit `6275dee`; Vercel deployed the new frontend/backend code.
- Verified: Production demo login passes, direct and proxied student lists return 9 rows, class discovery returns 4 classes, WhatsApp default credentials and attendance templates are detected, and the backend readiness check reaches Neon.
- Pending: Wait for the Hugging Face Space build to reach `RUNNING`; add `BIOMETRIC_ENCRYPTION_KEY` and `META_APP_SECRET` to backend Vercel; rotate the previously exposed AI key on both services; encrypt the legacy embedding; then run a signed chatbot webhook and one live kiosk scan.

## 2026-07-12 - Production services verified ready
- Completed: User configured production secrets and confirmed deployment; Hugging Face commit `07e88ef` is running and backend `/ready` reports database, AI service, and biometric encryption ready.
- Verified: AI API-key protection is enabled; WhatsApp default credentials, signature verification, chatbot, and all three attendance template settings report ready.
- Pending: Replace stale strict Hugging Face face-quality variable overrides with the tuned values in `ai-service/.env.example`, then repeat one real student enrollment and live class-session kiosk scan.

## 2026-07-12 - WhatsApp templates approved
- Completed: User confirmed the check-in, checkout, and absent WhatsApp templates are verified by Meta.
- Pending: Complete the final deployed enrollment, class-session kiosk scan, and WhatsApp delivery acceptance test.

## 2026-07-12 - WhatsApp test-recipient safety and chatbot diagnosis
- Completed: Added `WHATSAPP_TEST_MODE`/`WHATSAPP_TEST_RECIPIENT` outbound allowlisting, a Settings test-mode banner, shared phone normalization, and valid `03...` support on the WhatsApp test endpoint.
- Verified: The authorized number is linked to one active student; Meta previously returned message IDs for it; the database contains no inbound `STATUS` webhook rows and no delivered/read callbacks. Nine backend tests and frontend typecheck/lint/build pass.
- Pending: Deploy, enable the Vercel test allowlist for the masked test recipient, subscribe the WhatsApp Business Account `messages` webhook and make the Meta app live/test-deliverable, then send `STATUS` to the Meta business/test number and confirm inbound/reply rows.

## 2026-07-12 - WhatsApp test release deployed
- Completed: Deployed commit `4334c72`; the production test endpoint accepts local Pakistan mobile format, and Meta accepted one approved test template with a message ID.
- Pending: Set `WHATSAPP_TEST_MODE=true` and configure the masked test recipient in backend Vercel, redeploy, then fix/verify inbound `messages` webhook delivery and send `STATUS` from the linked test phone.

## 2026-07-12 - Meta app public policy pages
- Completed: Added public Privacy Policy, Terms of Service, and Data Deletion instructions pages, linked them from login, and added an environment-based privacy contact without committing personal data.
- Verified: Frontend typecheck, lint, and production build pass; all three pages are statically generated.
- Pending: Set `NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL`, deploy, paste the three production URLs and frontend app domain into Meta, and have the policy text reviewed before onboarding real schools.

## 2026-07-12 - Meta app switched Live
- Completed: User switched the Meta app to Live; production WhatsApp allowlist is active for `923***5979`, and secure webhook/chatbot readiness report true.
- Verified: The inbound-message table still contains zero rows.
- Pending: Send `STATUS` from the linked test phone to the Meta business/test number and confirm the webhook records and replies to it.

## 2026-07-13 - Daily class session lifecycle and dashboard controls
- Completed: Fixed stale class sessions, replaced the selected-class attendance control with an organization-wide class ON/OFF board, and deployed commit `6e36c38`.
- Changed: Active sessions are limited to the current school day; starting a class expires its forgotten prior-day row; a batch endpoint returns every class, student count, and current session; admin, HR, and branch-manager roles can independently start/stop each class while viewers remain read-only.
- Verified: Ten backend tests, frontend typecheck/lint/build, and Alembic drift check pass. A reversible Neon-backed test showed all four classes OFF, started only Class 10-A, confirmed it was the sole ON class, then stopped it and verified OFF.
- Decision: Retained the existing API-key-protected ArcFace service because no suitable permanently free third-party identification API was found. Production AI health exposed a stale ambiguity margin override of `0.3`; change it to `0.03` in Hugging Face settings before the next live recognition test.
- Deployment verified: The direct production backend and same-origin frontend proxy both return four independent Demo School class states, all currently OFF; the deployed frontend chunk contains the new board and records filter.
- Pending: Visually exercise two class controls in the browser; correct the Hugging Face margin override and run one real enrollment/kiosk scan.

## 2026-07-13 - Kiosk interface and expanded demo dataset
- Completed: Redesigned the attendance kiosk and expanded Demo School without resetting existing tenant data.
- Changed: Kiosk metadata now includes the real class name, room, active-student count, and current session state; the UI adds responsive camera status, face guidance, retry, explicit photo capture/upload fallbacks, clearer results, and session-aware scanning. Added an idempotent additive demo-data command.
- Data: Added 15 synthetic students, two missing classes, avatar placeholders, and 85 historical attendance rows. Demo School now has 24 active students across 6 classes; no face embeddings or WhatsApp messages were generated.
- Verified: Backend tests (10), frontend typecheck/lint/build, local API contract checks, idempotent reseeding, production data counts, and a headless visual kiosk smoke test pass. The temporary test session was stopped.
- Deployment verified: Pushed commit `37e4e14`; production backend returned Class 10-A with 5 active students and its closed session state, while the deployed frontend bundle contains the redesigned scanner, photo fallback, and upload action.

## 2026-07-13 - Final release review and empty-response proxy fix
- Completed: Audited local builds/tests, production auth and tenant data, class sessions, kiosk metadata, user lifecycle, student CRUD/profile image flow, AI health, WhatsApp readiness/webhook security, environment hygiene, and deployment-source synchronization.
- Fixed: The Next.js backend proxy constructed an empty body for FastAPI `204 No Content` responses, causing production user/student delete actions to appear as HTTP 500. Commit `518e520` returns a null body for HEAD/204/205/304 responses.
- Verified locally: Backend tests 10/10, no Alembic drift, Python dependency checks, AI tests 2/2, frontend typecheck/lint/build, zero npm audit findings, and proxy deactivate/reactivate/permanent-delete integration all pass.
- Verified in production: Health/readiness, database/AI/encryption configuration, demo login and viewer permissions, 24 students across 6 classes, class session ON/OFF cleanup, kiosk API-key rejection, cron-secret rejection, student create/profile/update/deactivate cleanup, user deactivate/reactivate/permanent-delete cleanup, approved WhatsApp templates, webhook challenge, unsigned webhook rejection, and AI API-key rejection all pass. No QA rows or active sessions remain.
- Local setup: Synced the stale root Hugging Face checkout to deployed commit `07e88ef`; both AI checkouts now match the monorepo service files.
- Remaining acceptance: Do one real live-camera recognition and one real inbound/outbound WhatsApp delivery test. One legacy ArcFace embedding is still plaintext; encrypt it only after confirming the local Fernet key matches the production backend key.

## 2026-07-14 - Fix missing WhatsApp chatbot events
- Diagnosed: Neon contained zero inbound webhook rows and zero chatbot logs despite a linked active student, valid permanent token, correct scopes, verified production callback, and a `messages` field subscription. The chatbot code was never reached.
- Root cause: The WABA was subscribed to a different older Meta app, not the current Student Attendance app.
- Fixed: Added the current app to the WABA through the Graph API without removing the older subscription. Meta returned success, and the WABA now reports the current app as subscribed.
- Pending: Send a fresh `STATUS` message from the allowlisted linked phone to the Meta business/test number, then confirm an inbound row and chatbot reply. Messages sent before the subscription fix will not be replayed.

## 2026-07-15 - WhatsApp delivery diagnosis
- Completed: Set all 24 active Demo School students' primary parent phone to the allowlisted WhatsApp test recipient and tested local plus deployed WhatsApp send paths.
- Verified: Local approved `hello_world` and `school_absent_alert` template sends returned Meta message IDs; deployed `/whatsapp/test` also returned a Meta message ID. The WABA is approved, the current app is subscribed, and school templates are approved. A signed production webhook simulation processed a `STATUS` message.
- Diagnosed: Existing cron attendance notifications failed with Meta error `Business Account locked`. The simulated chatbot reply failed with `Re-engagement message`, which is expected because a fake webhook does not open Meta's real 24-hour customer-service window.
- Pending: Send a real WhatsApp `STATUS` message from the linked test phone to the Meta test/business number and verify a new inbound row, chatbot reply, and delivery callback in `/notifications`.

## 2026-07-15 - Real-time session-only attendance
- Completed: Removed the 9 AM/late-grace rule from kiosk auto-marking, disabled the absent cron from creating attendance rows, removed the Settings start-time/late-grace controls, and added crop-based AI detection retries for kiosk/mobile photos.
- Changed: Kiosk scans now record `present` only during an active class session; if the class session is OFF, no attendance row is created. The cron endpoint remains available but returns a disabled/no-op result.
- Verified: Backend tests pass 11/11, AI service files compile, frontend typecheck passes, and frontend lint passes.
- Pending: Deploy the backend/frontend changes to Vercel and copy/deploy the AI service `main.py` crop-detection change to the HuggingFace Space before production testing.

## 2026-07-15 - Editable attendance records
- Completed: Added role-gated manual attendance editing for super admin, admin, HR, and branch manager users while keeping viewers read-only.
- Changed: Added `/attendance/manual` upsert support for present, absent, and excused records; the Attendance page now shows an Edit action to allowed users and can edit synthetic absent rows by creating a real record for that student/date.
- Verified: Backend tests pass 11/11, frontend typecheck passes, and frontend lint passes.
- Pending: Deploy to Vercel and verify one admin edit plus one viewer read-only session in production.

## 2026-07-16 - Production release-candidate hardening
- Completed: Replaced browser token persistence with Secure HttpOnly cookie authentication plus CSRF protection; added strict JWT claims, tenant/user revalidation, production startup validation, request IDs, structured request logs, no-store API responses, frontend CSP/HSTS, and safer proxy cookie/error/body handling.
- Completed: Made attendance one real-time mark per student/class session, removed all absent cron code, added the partial unique database index, kept manual corrections role gated, and made WhatsApp failures unable to roll back a successful attendance mark.
- Completed: Encrypted organization WhatsApp credentials at rest, added a legacy conversion command, stored only small student profile thumbnails, and made shared-number chatbot tenant resolution fail closed.
- Completed: Calibrated ArcFace/RetinaFace defaults to threshold `0.42`, supported up to three same-person enrollment photos, split enrollment/live augmentation for CPU latency, rejected ambiguous/group images, pinned audited dependencies, and pre-bundled ArcFace/RetinaFace weights in the non-root Hugging Face image.
- Completed: Added GitHub CI and Dependabot for backend, frontend, AI, Docker, and Actions dependencies. Updated release documentation and canonical project memory.
- Verified: 18 backend tests, 6 AI tests, frontend strict typecheck/lint/production build, npm audit, pip audits, package checks, and secret/ignore scans pass.
- Verified: The final Docker artifact reports model ready, enrolls a 512-dimensional vector, and matches the second real photo at `0.59`. A clean PostgreSQL 16 database upgrades through `c1d4e7f9a620` with no Alembic drift.
- Verified: Real Neon login/auth-me/logout works with cookies and CSRF, and the same flow passes through the production-built Next.js proxy.
- Pending: Push both repositories, confirm deployment environment values, deploy, migrate Neon from `a7e2d5c8f310` to `c1d4e7f9a620`, convert stored company credentials, then perform one live kiosk scan and one real inbound WhatsApp acceptance test.

## 2026-07-17 - Patch AI runtime dependency baseline
- Diagnosed: GitHub CI backend and frontend jobs passed, but the AI audit found three Keras advisories because Python 3.10 resolved Keras 3.12.3.
- Changed: Moved the AI Docker image and CI job to Python 3.11 and pinned Keras 3.15.0 in both the monorepo service and Hugging Face checkout.
- Verified: Six AI tests, compile, package checks, a Python 3.11 Linux dependency resolution, and a full resolved dependency audit pass with no known vulnerabilities.
- Deployed: Pushed Hugging Face `d20eb84` and main `7288424`; GitHub CI passes, both Vercel services serve the hardened release, backend readiness is green, and production cookie auth passes.
- Pending: Change stale Hugging Face overrides from OpenCV/`0.58` to RetinaFace/`0.42`, migrate Neon from `a7e2d5c8f310` to `c1d4e7f9a620`, convert legacy credentials, and complete one real class-session camera scan.

## Entry Template
```markdown
## YYYY-MM-DD — Short session title
- Completed:
- Changed:
- Verified:
- Pending:
```
