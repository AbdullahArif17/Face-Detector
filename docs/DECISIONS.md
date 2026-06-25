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
- Status: Accepted
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

## Decision Template
```markdown
## D-NNN: Decision title
- Date: YYYY-MM-DD
- Status: Proposed | Accepted | Superseded by D-NNN
- Context: Why a decision is needed.
- Decision: What was chosen.
- Consequences: Important tradeoffs and follow-up work.
```
