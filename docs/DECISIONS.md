# Decision Log

## D-001: Repository files are canonical project memory
- Date: 2026-06-25
- Status: Accepted
- Context: Chat and IDE context is not reliably shared between agents.
- Decision: Store durable context in version-controlled `PROJECT_CONTEXT.md`, `docs/DECISIONS.md`, and `docs/SESSION_LOG.md`.
- Consequences: Every agent must read these files at session start and update them after meaningful changes.

## D-002: Split the attendance platform into three services
- Date: 2026-06-25
- Status: Accepted
- Context: The dashboard, business data API, and compute-heavy biometric inference have different runtimes and scaling/security concerns.
- Decision: Use a Next.js frontend, FastAPI business backend, and separate FastAPI DeepFace AI service under `face-attendance/`.
- Consequences: Each service has independent dependencies and runtime configuration; cross-service authentication and deployment orchestration remain future work.

## D-003: Use local normalized NumPy embeddings for the MVP only
- Date: 2026-06-25
- Status: Superseded by D-008
- Context: The initial scaffold needs functional enrollment and recognition without introducing external infrastructure.
- Decision: Store one normalized `.npy` face embedding per employee in `ai-service/embeddings/`.
- Consequences: This is not a production biometric store; encryption, tenant isolation, access controls, lifecycle management, and scalable retrieval must be added before real deployment.

## D-004: Use Neon for managed PostgreSQL
- Date: 2026-06-25
- Status: Superseded by D-005
- Context: The project needs hosted PostgreSQL without maintaining a local database server, while authentication remains in the FastAPI backend.
- Decision: Use a direct Neon Postgres connection with SQLAlchemy asyncpg and Alembic.
- Consequences: Developers need a Neon project and connection URL. A separate pooled runtime URL can be introduced later without using pooling for migrations.

## D-005: Target Supabase Postgres and application-managed JWT auth
- Date: 2026-06-25
- Status: Superseded by D-006
- Context: Phase 2 explicitly moves managed PostgreSQL to Supabase while keeping identity and authorization in the FastAPI application.
- Decision: Use Supabase Postgres through SQLAlchemy asyncpg, 30-minute application JWTs, `/auth/login`, `/auth/me`, and tenant-filtered protected API routes.
- Consequences: A real Supabase connection string is still required. Frontend tokens are stored in localStorage per the Phase 2 requirement and must be reconsidered for stronger XSS resistance before production.

## D-006: Keep Neon Postgres with application-managed JWT auth
- Date: 2026-06-25
- Status: Accepted
- Context: The project already has a working Neon database and the user confirmed Neon is the intended managed PostgreSQL provider.
- Decision: Keep Neon through SQLAlchemy asyncpg and Alembic while retaining the Phase 2 JWT login, `/auth/me`, and tenant-filtered protected routes.
- Consequences: No database migration between providers is needed. Frontend tokens remain in localStorage per the Phase 2 requirement and should be moved to a stronger storage strategy before production.

## D-007: Upgrade frontend to Next.js 16 and React 19
- Date: 2026-06-25
- Status: Accepted
- Context: Next.js 14 was selected by the initial scaffold request but is outdated and affected by known security advisories.
- Decision: Upgrade to Next.js 16.2.9, React 19.2.7, ESLint 9 flat configuration, and Turbopack production builds.
- Consequences: `next lint` is replaced by the ESLint CLI. Two moderate transitive PostCSS advisories remain in the current stable Next.js package and should be monitored upstream.

## D-008: Store Phase 3 face embeddings through the backend database contract
- Date: 2026-06-27
- Status: Accepted
- Context: Phase 3 requires employee face enrollment from the dashboard and tenant-scoped enrollment status in the business API.
- Decision: Keep the AI service stateless for embedding extraction/comparison and store enrolled vectors in the backend `face_embeddings` table as JSON for the MVP.
- Consequences: The backend can report enrollment status and enforce tenant ownership. JSON biometric storage is not production-ready; encryption, tenant isolation, audit logging, retention, and deletion controls must be designed before real biometric deployment.

## D-009: Use company API keys for unattended kiosk attendance
- Date: 2026-06-28
- Status: Accepted
- Context: Kiosk devices need to mark attendance without a logged-in dashboard user, but must remain scoped to one organization.
- Decision: Store a generated `companies.api_key`, use `X-API-Key` for `/attendance/auto-mark`, and keep dashboard APIs on JWT plus role checks.
- Consequences: Kiosk URLs can be copied from Settings and regenerated when compromised. API keys are bearer secrets and must be protected, rotated, audited, and eventually replaced or supplemented with device registration for production.

## D-010: Proxy browser API calls through Next.js for HTTPS kiosk testing
- Date: 2026-06-28
- Status: Accepted
- Context: Mobile browsers block live camera access outside trusted HTTPS secure contexts, and HTTPS frontend pages cannot call a local HTTP FastAPI backend directly because of mixed-content restrictions.
- Decision: Add a same-origin Next.js proxy at `/api/backend/*` and use `NEXT_PUBLIC_API_URL=/api/backend` for HTTPS kiosk testing while forwarding server-side to `BACKEND_INTERNAL_URL`.
- Consequences: A trusted HTTPS tunnel can expose only the frontend, and browser API calls remain same-origin. This is a development/testing convenience, not a replacement for a production API gateway, device registration, or secure deployment topology.

## D-011: Pivot active product model to school students and parent WhatsApp alerts
- Date: 2026-06-29
- Status: Accepted
- Context: The product direction changed from general employee attendance to school student attendance where parents need WhatsApp notifications for check-in, check-out, and absence events.
- Decision: Add `students` and `whatsapp_logs`, pivot active attendance and face embedding references to `student_id`, keep tenant companies as schools, and add Meta WhatsApp Business API integration with per-school credentials plus global fallback env values.
- Consequences: Legacy employee code remains only for compatibility while the active frontend and backend flows use students. WhatsApp credentials must be protected as secrets, parent opt-in/compliance must be addressed before production, and biometric storage still requires production-grade encryption and retention controls.

## D-012: Require organization name during portal login
- Date: 2026-06-29
- Status: Accepted
- Context: The application is multi-tenant and school/organization-specific, so users should explicitly sign into the intended organization portal.
- Decision: Require `organization_name`, `email`, and `password` for `/auth/login`; the backend matches the user to an active company with that exact trimmed case-insensitive name before issuing a JWT.
- Consequences: Demo and manual login flows must include the organization name. Organization names are now part of the login contract; a future slug/subdomain model may replace exact-name matching for production.

## D-013: Scope portal user email uniqueness to each organization
- Date: 2026-06-29
- Status: Accepted
- Context: A person may work with multiple schools or organizations using the same email address.
- Decision: Remove global uniqueness from `users.email` and enforce unique `(company_id, email)` instead; login remains organization-specific so the same email can resolve to different tenant user rows.
- Consequences: Each organization still prevents duplicate local users with the same email. For production, a separate global identity/account table plus organization membership table would provide cleaner cross-organization account management.

## D-014: Require active class sessions for kiosk attendance
- Date: 2026-07-03
- Status: Accepted
- Context: School attendance should be controlled class-wise so staff can intentionally open and close attendance collection windows.
- Decision: Add `attendance_sessions` per organization/class, attach attendance rows to `session_id` when marked through the kiosk, and require an active class session before `/attendance/auto-mark` records check-in or check-out.
- Consequences: Kiosk URLs are not enough by themselves; staff must start attendance for the class from `/attendance`. This prevents off-window scans, but production still needs richer timetable, shift, audit, and permission policy.

## D-015: Separate portal user deactivation from permanent removal
- Date: 2026-07-03
- Status: Accepted
- Context: Organization admins need reversible user access removal, but also need a way to completely remove mistakenly created or unused portal users.
- Decision: Keep `DELETE /users/{id}` as soft deactivation, add a separate permanent removal API, support admin password reset, show organization context to super admins, and reactivate/update an inactive same-organization email when creating a user. Organization admins may assign tenant-level admin, HR, branch manager, and viewer roles; super admin remains reserved.
- Consequences: Inactive users cannot log in until reactivated. Permanent removal is blocked by database constraints when historical records reference the user, preserving audit integrity. Password reset is an MVP admin action and should be replaced or supplemented with invite/email-reset flows before production.

## D-016: Improve MVP face recognition with ArcFace and quality gates
- Date: 2026-07-06
- Status: Accepted
- Context: The kiosk needs fewer false accepts and more reliable recognition than the initial Facenet-only MVP.
- Decision: Use DeepFace ArcFace with RetinaFace, reject low-quality images before embedding extraction, average original and horizontally flipped embeddings, and require a minimum best-vs-runner-up similarity margin before accepting a match.
- Consequences: Existing Facenet embeddings are incompatible and must be re-enrolled. Recognition is stricter and may reject blurry/dark/small-face images instead of guessing. First startup or first enrollment may be slower while ArcFace weights load/download.

## D-017: Deploy AI inference on HuggingFace Spaces and trigger absent alerts through Vercel Cron
- Date: 2026-07-07
- Status: Accepted
- Context: Vercel's function bundle limits are not suitable for the DeepFace AI service, while the backend deployment needs serverless-safe absent alert scheduling.
- Decision: Package `ai-service` as a HuggingFace Docker Space on port `7860`, keep the ArcFace/RetinaFace pipeline, make `AI_API_KEY` optional for test deployment, remove APScheduler, and expose `/api/cron/absent-alerts` for Vercel Cron.
- Consequences: The AI service can deploy separately from Vercel and warm up its model on startup. Absent alerts now depend on Vercel Cron and `CRON_SECRET` environment configuration instead of an in-process scheduler. A public AI Space without `AI_API_KEY` is acceptable only for controlled testing.

## D-018: Use configurable WhatsApp templates for business-initiated alerts
- Date: 2026-07-07
- Status: Accepted
- Context: Meta restricts free-form WhatsApp text messages outside the customer-service window, while attendance alerts are usually initiated by the school.
- Decision: Keep free-form text as a fallback, but support configured Meta template names for check-in, check-out, and absent alerts through backend environment variables. Persist webhook delivery statuses against existing WhatsApp logs by Meta message ID.
- Consequences: Production schools must create and approve matching WhatsApp templates in Meta before automated parent alerts are reliable. Template variable order must match the backend payload, and webhook callbacks can now move logs from `sent` to `delivered`, `read`, or `failed`.

## Decision Template
```markdown
## D-NNN: Decision title
- Date: YYYY-MM-DD
- Status: Proposed | Accepted | Superseded by D-NNN
- Context: Why a decision is needed.
- Decision: What was chosen.
- Consequences: Important tradeoffs and follow-up work.
```
