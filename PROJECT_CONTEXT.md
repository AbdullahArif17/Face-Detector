# Project Context

Last updated: 2026-07-12

## Project
- Name: Face Attendance
- Stage: Phase 5 school student attendance and WhatsApp parent notifications
- Objective: Build a multi-tenant AI face-recognition school attendance SaaS.

## Current State
- Repository memory structure initialized.
- Application scaffold lives in `face-attendance/`.
- Frontend: Next.js 16.2.9, React 19.2.7, strict TypeScript, Tailwind CSS, App Router, shadcn/ui configuration.
- Backend: FastAPI, async SQLAlchemy, Neon Postgres, Alembic, JWT authentication, role-gated user management, company API-key kiosk auth, tenant-filtered school/student/attendance routes, and WhatsApp notification logs.
- AI service: FastAPI, DeepFace ArcFace with RetinaFace detection, OpenCV quality gates, augmented embedding extraction, stateless embedding comparison endpoints, and HuggingFace Spaces Docker deployment files.
- Backend and AI-service dependencies are installed locally.
- All Alembic migrations through `a7e2d5c8f310_school_attendance_schedule` are generated and applied to the current Neon development database; Alembic reports no schema drift.
- `backend/.env` contains a working Neon pooled connection with SSL enabled.
- Backend Phase 3 stores face vectors in the `face_embeddings` table as JSON for the MVP.`
- Historical Phase 1 local `.npy` enrollment/recognition tests succeeded, but local AI-service embedding files are no longer the active Phase 3 storage contract.
- Face-recognition accuracy pass uses ArcFace, configurable RetinaFace/OpenCV/SSD detection, blur/brightness/face-size gates, EXIF orientation correction, detection resizing, original+horizontal-flip embedding averaging, ambiguous-match rejection, payload limits, and serialized inference on constrained Hugging Face hardware. Runtime quality values are validated instead of silently capped. Existing Facenet enrollments must be re-enrolled.
- New production face embeddings can be encrypted at rest with `BIOMETRIC_ENCRYPTION_KEY`; model-mismatched embeddings are excluded from recognition. One legacy development embedding remains plaintext until re-enrollment or `python -m app.encrypt_face_embeddings` is run with a key.
- Frontend dependencies are installed with Axios, AuthContext, signup/login flows, protected dashboard routes, and authenticated data requests.
- Frontend Phase 3 includes employee search/filter/table management, add/edit employee modal with optional face-photo enrollment and retry-on-failure handling, enrolled-state-aware face enrollment/update UI, webcam or uploaded-photo face enrollment modal, enrollment-focused dashboard stats, and employee headshot display.
- Frontend Phase 4 includes a standalone `/kiosk` webcam page using company API-key auth and displaying organization name, `/users` portal user management with deactivate/reactivate actions, `/attendance` Today/History tabs, conditional Users sidebar link, and `/settings` kiosk API-key setup.
- Frontend Phase 5 includes `/students`, `/notifications`, student-focused dashboard/attendance/kiosk views, WhatsApp configuration/status in Settings, masked parent phone displays, CSV student import, optional student profile-photo upload in Add/Edit Student with one-step face enrollment, student face enrollment/update, and per-student WhatsApp logs.
- Frontend mobile responsiveness includes a dashboard mobile top bar and slide-out navigation drawer, mobile-safe page spacing/headings, horizontally scrollable data tables with minimum widths, stacked modal action buttons, and phone-friendly kiosk layout.
- Mobile local HTTP testing cannot use live `getUserMedia` camera or modern Clipboard API reliably because phone browsers require trusted HTTPS secure contexts; kiosk has a `Capture/Upload Photo` fallback for local HTTP testing. True live mobile kiosk scanning should use a trusted HTTPS frontend URL with `NEXT_PUBLIC_API_URL=/api/backend` and `BACKEND_INTERNAL_URL` pointing to the local FastAPI backend so browser requests stay same-origin.
- Backend Phase 4 includes `/users`, `/users/{id}/activate`, company API-key retrieval/regeneration, `/companies/kiosk-info`, `/attendance/auto-mark`, `/attendance/today`, `/attendance/history`, and `/attendance/export`.
- Backend Phase 5 includes `students`, `whatsapp_logs`, `attendance.student_id`, WhatsApp school settings with global fallback credentials on companies, `/students`, `/students/import`, `/whatsapp/logs`, `/whatsapp/stats`, `/whatsapp/test`, `/whatsapp/retry-failed`, Vercel Cron-triggered absent alerts, Meta WhatsApp webhook verification/status callbacks at `/webhooks/whatsapp`, and optional template-based WhatsApp sends.
- Backend supports class-wise attendance sessions with one-active-session-per-class database enforcement, organization class discovery, configurable school start time/grace period, Pakistan-time day boundaries, and kiosk auto-marking that requires an active session for the requested class.
- Portal login is tenant-aware: users must enter the exact organization/school name, email, and password; `/auth/login` validates the user against an active matching company record before issuing a JWT.
- Portal user email uniqueness is tenant-scoped: the same email address may belong to multiple organizations, but each organization can only have one active user row for that email.
- Portal user management uses soft deactivation for reversible access removal, supports reactivation, supports admin password reset from Edit User, and provides a separate permanent removal action for user rows that are not referenced by historical records. Creating a user with an inactive same-organization email reactivates and updates that existing row.
- Organization admins can create and assign organization-level admin, HR, branch manager, and viewer roles inside their own tenant; only super admin is reserved globally.
- Super admin Users view shows each user's organization so cross-tenant accounts are not confused during organization-specific login.
- Backend and AI service support optional `AI_API_KEY` through environment configuration. If set on both services, backend sends `X-API-Key`; if unset, the HuggingFace Space can run without an AI-service secret for test deployment.
- Frontend list consumers fetch all employee/attendance pages so dashboard stats are not truncated by backend pagination.
- `python -m app.reset_demo_data` resets the development database to one clean Demo School tenant, one demo admin, 3 classes, 8 students, today's attendance rows, and no face embeddings so real ArcFace enrollments can be added.
- This workstation uses backend port 8004 through `frontend/.env.local` because orphaned/stale Windows listeners occupy ports 8000/8002/8003; project defaults remain port 8000.
- WhatsApp Cloud API credentials were verified with Meta's built-in template send and the backend `/whatsapp/test` endpoint; both returned accepted/sent message IDs during local testing.
- WhatsApp uses configurable Graph API/template languages, approved templates for retries, Meta request-signature verification, persisted delivery errors, inbound message deduplication, and a parent `STATUS` chatbot. Settings exposes credential/template/chatbot readiness. Phone validation accepts Pakistan `92...` and local `03...` formats.
- Vercel-safe attendance notifications are awaited rather than launched with disposable in-process tasks. Daily absent cron remains fixed at 4:00 UTC/9:00 PKT; Hobby scheduling may run later within that hour.
- Frontend optimizes/rotates source photos up to 12 MB into sub-2 MB JPEGs, gives face requests a 115-second timeout, uses real class selectors for kiosk links, and shows class-wise dashboard summaries.
- HuggingFace AI service production-hardening commit `07e88ef` is running at `https://abdullah017-face-attendance-ai.hf.space`; `/health` reports ArcFace/RetinaFace with API-key protection. The Space still has older strict quality overrides (`RECOGNITION_THRESHOLD=0.7`, `RECOGNITION_MARGIN=0.05`, 70px face minimums, `MIN_FACE_AREA_RATIO=0.03`, `MIN_BLUR_SCORE=20`) that should be replaced with `.env.example` values.
- GitHub production-hardening commit `6275dee` is deployed. Backend `https://face-detector-k4dl.vercel.app` passes `/health` and `/ready`; Neon, the AI service, and biometric encryption all report ready.
- Deployed organization-scoped demo login, direct `/students`, real class discovery, and the frontend same-origin `/api/backend` proxy all pass; Demo School currently returns 9 students and 4 classes.
- Production default WhatsApp credentials, all three approved attendance templates, Meta signature verification, and the inbound parent `STATUS` chatbot all report ready.
- Production login previously returned 500 for existing users because password verification crashed in the production runtime; backend password hashing/verification now uses direct `bcrypt` instead of Passlib.
- Frontend production proxy buffers upstream backend responses before returning them; direct response streaming returned empty bodies for some JSON endpoints such as `/students` on Vercel.
- For same-Wi-Fi mobile testing, this workstation uses LAN IP `192.168.0.116`; point the frontend API/proxy to the active backend port, backend `FRONTEND_ORIGINS` includes `http://192.168.0.116:3000`, and dev servers must be started with host `0.0.0.0`.

## Working Assumptions
- Project knowledge must remain portable across chat agents and IDEs.
- Version-controlled repository files are the canonical shared memory.
- Agent-specific instruction files must reference this document rather than duplicate project state.

## Architecture
- `face-attendance/frontend`: browser dashboard on port 3000.
- `face-attendance/backend`: business API, Neon Postgres access, JWT auth, student CRUD, WhatsApp logs, and DB-backed face enrollment on port 8000.
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
| Frontend run on LAN | `cd face-attendance/frontend && npm.cmd run dev -- -H 0.0.0.0` |
| Frontend run for HTTPS tunnel kiosk | `cd face-attendance/frontend && $env:NEXT_PUBLIC_API_URL="/api/backend"; $env:BACKEND_INTERNAL_URL="http://127.0.0.1:8004"; npm.cmd run dev -- -H 0.0.0.0` |
| Frontend checks | `cd face-attendance/frontend && npm run typecheck && npm run lint` |
| Backend run | `cd face-attendance/backend && uvicorn main:app --reload --port 8000` |
| Backend run on LAN | `cd face-attendance/backend && .\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 0.0.0.0 --port 8004` |
| Backend migrate | `cd face-attendance/backend && .\.venv\Scripts\python.exe -m alembic upgrade head` |
| Seed demo data | `cd face-attendance/backend && .\.venv\Scripts\python.exe -m app.seed` |
| Reset demo data | `cd face-attendance/backend && .\.venv\Scripts\python.exe -m app.reset_demo_data` |
| AI service run | `cd face-attendance/ai-service && uvicorn main:app --reload --port 8001` |
| AI service Docker build | `cd face-attendance/ai-service && docker build -t face-attendance-ai .` |

## Active Work
- Add the new production environment variables to Vercel/Hugging Face, deploy both repositories, and run one real browser kiosk scan against the deployed services.
- Set `BIOMETRIC_ENCRYPTION_KEY`, run `python -m app.encrypt_face_embeddings`, and rotate the previously exposed AI API key in both deployments.
- Set `META_APP_SECRET`, attendance template names/languages, and subscribe the Meta app to WhatsApp `messages`; verify a real inbound `STATUS` reply.
- Add broader authorization/API integration tests, CI, email verification, and a refresh-token or secure-cookie strategy.
- Define biometric consent, retention, deletion, encryption, WhatsApp opt-in, and audit requirements before production use.

## Open Questions
- What tenant-isolation and role-permission rules are required?
- Will attendance recognition use kiosk cameras, school devices, or uploaded images?
- What jurisdiction-specific biometric compliance requirements apply?
- Which production embedding store and deployment platform will be used?

## Handoff
- Start with `face-attendance/README.md`.
- Apply migrations with `python -m alembic upgrade head`; latest revision is `a7e2d5c8f310_school_attendance_schedule`.
- HuggingFace Spaces deployment for `face-attendance/ai-service` is live at `https://abdullah017-face-attendance-ai.hf.space`; it listens on port `7860` and exposes `/health`.
- `AI_API_KEY` is optional for the AI service. If set on the AI service, set the same value on the backend; otherwise leave it unset in both places for test deployment.
- AI service now uses `DEEPFACE_MODEL=ArcFace`; any students enrolled under the previous Facenet configuration must be re-enrolled before kiosk recognition will work reliably.
- Use `python -m app.reset_demo_data` to wipe old development data and recreate the clean Demo School dataset.
- Demo login uses organization `Demo School`, email `admin@demo.com`, and password `admin123`.
- If a portal user cannot log in after being "deleted", check `/users`: soft-deactivated accounts must be activated or permanently removed before reuse.
- Frontend uses `NEXT_PUBLIC_API_URL` from `frontend/.env.local`.
- Production frontend proxy requires `BACKEND_INTERNAL_URL=https://face-detector-k4dl.vercel.app`; deployed proxy health and demo login through `https://face-detector-seven.vercel.app/api/backend/*` now pass.
- On this workstation, start the backend on port 8004 or restore `.env.local` to port 8000 after clearing the orphaned/stale listeners.
- Kiosk URLs are created from Settings and use `/kiosk?key=[company_api_key]&class_id=[class_id]`; old `/kiosk?...&branch=[class_id]` URLs remain accepted. The kiosk uses `X-API-Key`, not JWT.
- Before using a kiosk URL for a class, an admin/HR/branch manager must open `/attendance`, select the class, and start that class attendance session; stopping the session blocks additional kiosk marks for that class.
- WhatsApp credentials can be configured per school in Settings or via global fallback `META_WHATSAPP_TOKEN` and `META_PHONE_NUMBER_ID`; real tokens must not be stored in repository memory.
- Meta WhatsApp webhook verification uses `META_WEBHOOK_VERIFY_TOKEN` and callback URL `/webhooks/whatsapp`.
- Production outbound WhatsApp alerts should use approved templates by setting `META_CHECKIN_TEMPLATE_NAME`, `META_CHECKOUT_TEMPLATE_NAME`, `META_ABSENT_TEMPLATE_NAME`, and `META_TEMPLATE_LANGUAGE` on the backend.
- Vercel Cron calls `/api/cron/absent-alerts` at `0 4 * * *`; the deployed backend is protected by `CRON_SECRET` and rejects invalid bearer tokens.
- Do not treat JSON embedding storage, local embedding files, or client-side route guards as sufficient production security boundaries.
