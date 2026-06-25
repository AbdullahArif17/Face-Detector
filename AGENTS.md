# Agent Instructions

## Start Every Session
- Read `PROJECT_CONTEXT.md`.
- Read the latest entries in `docs/SESSION_LOG.md`.
- Read `docs/DECISIONS.md` before changing architecture or dependencies.
- Treat repository files as the source of truth; chat history is secondary.

## Memory Updates
- Update `PROJECT_CONTEXT.md` when goals, architecture, constraints, commands, or current status change.
- Append a concise entry to `docs/SESSION_LOG.md` after meaningful work.
- Record durable technical choices in `docs/DECISIONS.md`; do not rewrite accepted decisions without marking them superseded.
- Never store secrets, credentials, tokens, or personal data in memory files.

## Working Rules
- Inspect existing files and uncommitted changes before editing.
- Preserve user changes unrelated to the current task.
- Keep memory concise, factual, and useful to the next agent.
- Verify changed behavior with the narrowest relevant test.
- If documentation conflicts with code, verify the code and then correct the documentation.

## Project Commands
- Use commands documented in `PROJECT_CONTEXT.md` and `face-attendance/README.md`.
- Run frontend commands from `face-attendance/frontend`.
- Run Python service commands from the corresponding service directory.

## Commit Attribution
AI commits MUST include:
```text
Co-Authored-By: (the agent model's name and attribution byline)
```
