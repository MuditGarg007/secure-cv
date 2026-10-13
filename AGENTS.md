# AGENTS.md

Entry point for coding agents working in this repo. Read this file first, then the doc(s) relevant to your task.

## Project

Hackathon build for the problem statement in `ps.md` (CC6-IC04): passwordless auth. Passkeys (WebAuthn) are the login credential. Face + hand-gesture liveness is the USP: it is the step-up check for risky logins and a factor in account recovery. It is NEVER a standalone login (see `docs/security.md`).

This is a hackathon demo, not production. Prefer the simplest thing that works and demos well. Two processes (`web/` Next.js + SQLite, `bio/` FastAPI), no other infra.

Status: foundation (M0) is on `main`. The rest is built by four parallel agents, each in its own worktree/branch, then merged by a master reviewer.

## Parallel agents: read first

If you are one of the four agents (auth, bio, devices, recovery), **`docs/agents/workflow.md` is binding and overrides the Workflow section at the bottom of this file**. Your task list is `docs/agents/<your-agent>.md`. Ownership of every path is in `scripts/owners.txt`; check yourself with `scripts/check-scope.sh <agent>` before every commit. The master reviewer follows `docs/agents/reviewer.md`.

## Doc index

| File | Read when |
|---|---|
| `ps.md` | Original problem statement. Source of truth for requirements. |
| `docs/architecture.md` | Any task. Components, stack, repo layout, env vars, conventions. |
| `docs/data-model.md` | Touching the SQLite schema. |
| `docs/api.md` | Implementing or calling an HTTP endpoint. |
| `docs/flows.md` | Building any user-facing journey, incl. recovery state machine. |
| `docs/auth.md` | Passkeys, sessions, reauth, risk check. |
| `docs/biometrics.md` | Face/gesture enrollment, liveness challenge, bio service. |
| `docs/security.md` | Threat model and invariants. Read before any auth/session/recovery change. |
| `docs/phishing-demo.md` | Building the phishing-resistance demo. |
| `docs/roadmap.md` | Milestones and demo script (agents: use your brief instead). |
| `docs/foundation.md` | Shared helpers already on `main`. Read before writing any web code. |
| `docs/agents/workflow.md` | Parallel-agent rules (STRICT). |
| `docs/agents/{auth,bio,devices,recovery}.md` | Each agent's brief, status and handoff. |
| `docs/agents/reviewer.md` | Master reviewer merge + verification procedure. |

## Hard rules (never violate)

1. No passwords, no SMS/email OTP, no magic-link login anywhere.
2. Face/gesture verification never grants a session on its own. It only clears step-up on a passkey session or advances a recovery that also needs the recovery code.
3. Biometric decisions are made in `bio/` from raw frames. Never trust a result computed in the browser.
4. Raw face/hand images are never stored or logged. Face templates are stored only as encrypted blobs from bio.
5. WebAuthn: `userVerification: "required"`; verify origin, rpID, challenge and signCount on every ceremony. Challenges are single-use and expire.
6. Every state-changing route validates input with zod and checks the session (`requireSession`, see `docs/auth.md`).
7. Sensitive actions (see `docs/auth.md#sessions`) require reauth within the last 5 minutes.
8. Auth-relevant actions write an `auth_events` row. Never update or delete those rows.
9. Biometric scores never reach the client. Only pass/fail + a coarse hint.
10. Thresholds and TTLs live in `web/src/server/config.ts` / `bio/app/config.py`, never inline.
11. Don't add infra (Redis, Postgres, Docker, queues, email) or new services without asking.

## Workflow for agents

- Parallel agents: follow `docs/agents/workflow.md` (ownership, contracts, git, handoff). It wins over the lines below.
- Single agent on `main` (master): work on the current milestone in `docs/roadmap.md`; if a doc is wrong, fix it in the same change.
- Record design decisions not covered by the docs under a `Decisions` section in the relevant doc (agents: in your brief or owned doc), one line each with the reason.
- Run checks for what you touched before declaring done (`cd web && pnpm typecheck && pnpm lint && pnpm test`, `cd bio && uv run pytest`).
