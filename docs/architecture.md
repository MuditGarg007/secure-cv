# Architecture

Hackathon scope. Two processes, one SQLite file, no other infra.

## Components

```
  Browser                       web/  (Next.js: UI + API + SQLite)
 ┌─────────────────┐           ┌──────────────────────────────────┐
 │ WebAuthn API    │◄────────► │ auth      passkeys, sessions     │
 │ (platform,      │           │ devices   QR link, list, revoke  │
 │  phone, key)    │           │ stepup    risk check + liveness  │
 │                 │           │ recovery  code + liveness + wait │
 │ Camera frames ──┼─────────► │ admin     users, devices, events │
 └─────────────────┘           └───────┬───────────────┬──────────┘
                                       │ HTTP + token  │
                               ┌───────▼────────┐  ┌───▼────────┐
                               │ bio/ (FastAPI) │  │ web/data/  │
                               │ face embed     │  │ app.db     │
                               │ gesture detect │  │ (SQLite)   │
                               │ template crypto│  └────────────┘
                               └────────────────┘
  phish/  look-alike sign-in page for the phishing demo (docs/phishing-demo.md)
```

- **web**: all UI and all `/api/*` routes. Owns the DB. Runs WebAuthn ceremonies, sessions, the risk check, and forwards camera frames to bio.
- **bio**: stateless Python service. Turns frames into a pass/fail decision and encrypts/decrypts face templates. Holds `BIO_TEMPLATE_KEY`, so web stores templates it cannot read. Only web calls it (`X-Internal-Token` header).
- **SQLite**: everything durable and ephemeral (sessions, challenges with `expires_at`). No Redis, no Postgres.

## Stack

| Concern | Choice |
|---|---|
| Web | Next.js (App Router, Node runtime), TypeScript strict, Tailwind + shadcn/ui |
| Validation | zod |
| WebAuthn | `@simplewebauthn/server` + `@simplewebauthn/browser` |
| DB | SQLite via Drizzle ORM + `better-sqlite3`. `drizzle-kit push` is fine, no migration discipline needed. |
| Recovery code hashing | `@node-rs/argon2` |
| QR | `qrcode` (generate only; the phone's camera app opens the link) |
| Voice prompts | browser `speechSynthesis` |
| Web tests | Vitest for pure logic (risk, recovery state machine) |
| Bio | Python 3.12, FastAPI, uv |
| Face | InsightFace `buffalo_l` (SCRFD detector + ArcFace embedding) run directly on onnxruntime CPU (no `insightface` package; see `docs/biometrics.md#decisions`) |
| Gestures | MediaPipe Tasks `GestureRecognizer` (canned classes), `mediapipe` pinned to 0.10.x |
| Bio crypto | `cryptography` AES-256-GCM |
| Bio tests | pytest |

Use latest stable versions. Trust installed package types over memory.

InsightFace weights are non-commercial only. Fine for a demo; listed as a gap in `docs/security.md`.

Not used: auth SaaS, NextAuth, Redis, Postgres, Docker, Turborepo, email. Ask before adding infra.

## Repo layout

```
/
├── AGENTS.md, CLAUDE.md, ps.md, docs/
├── web/
│   ├── data/app.db              gitignored
│   └── src/
│       ├── app/                 pages + app/api/** route handlers
│       ├── components/          UI (shadcn in components/ui)
│       ├── lib/                 client helpers (camera capture, voice)
│       └── server/              server-only code ("server-only" import)
│           ├── db/              drizzle schema + client
│           ├── auth/            webauthn, sessions, reauth guard
│           ├── bio/             bio client + challenge generation
│           ├── devices/, admin/ device-link + admin queries (agent C)
│           ├── recovery/        machine.ts (pure state machine) + service (agent D)
│           ├── risk.ts          pure scoring function
│           ├── events.ts        auth_events writer
│           └── config.ts        ALL web tunables (one section per agent)
│   ├── drizzle/                 generated SQL migration, applied automatically on first DB use
│   └── scripts/dev-session.mjs  dev-only CLI that seeds a signed-in session (docs/foundation.md)
├── bio/
│   ├── app/                     main.py, pipeline.py, crypto.py, config.py
│   ├── models/                  gitignored, fetched by scripts/download_models.py
│   └── tests/
├── phish/                       index.html + server.mjs + attack script (own package.json)
└── scripts/                     owners.txt + check-scope.sh (parallel-agent ownership)
```

Shared helpers available on `main` are documented in `docs/foundation.md`. Path ownership per agent is in `scripts/owners.txt`.

## Env vars

`web/.env.local` (commit `.env.example`):

| Var | Example | Notes |
|---|---|---|
| `RP_ID` | `localhost` | WebAuthn rpID |
| `RP_NAME` | `Secure` | shown in OS passkey prompt |
| `ORIGIN` | `http://localhost:3000` | exact expected origin |
| `BIO_URL` | `http://localhost:8000` | |
| `BIO_INTERNAL_TOKEN` | random | shared with bio |
| `ADMIN_HANDLES` | `admin,mudit` | comma list of handles that get admin role |
| `DEBUG_RISK` | `0` | `1` enables the "simulate location" header. Demo only. |
| `RECOVERY_COOLDOWN_OVERRIDE_S` | empty | e.g. `60` to shorten recovery cooldown for the demo |

`bio/.env`: `BIO_INTERNAL_TOKEN`, `BIO_TEMPLATE_KEY` (32 bytes base64), `BIO_FAKE` (`1` skips models and passes/fails from a `fake` field; for dev without a camera).

Read env through a small validated module (zod in web, pydantic-settings in bio). Fail fast if missing.

## Conventions

- Route handlers are thin: zod-parse, call a `server/*` function, return JSON. Server components may read the DB directly (admin and account pages need no read APIs).
- Errors: `{ "error": { "code": "REAUTH_REQUIRED", "message": "..." } }`. Codes listed in `docs/api.md`. Never put stack traces or bio scores in `message`.
- Binary over JSON is base64url. Timestamps are ISO strings. IDs are random UUIDs.
- Tunables (TTLs, thresholds, weights) live only in `web/src/server/config.ts` and `bio/app/config.py`.
- Never log frames, recovery codes, session tokens or templates.
- Tests: `cd web && pnpm test`, `cd bio && uv run pytest`. Write tests for pure logic, skip them for UI.
- Run locally: `cd bio && uv run fastapi dev app/main.py --port 8000`, `cd web && pnpm dev`. WebAuthn works on `http://localhost` without HTTPS. Parallel agents use their own ports (`docs/agents/workflow.md#team`).
- UI kit is shadcn on Base UI (`style: base-nova`): compose with the `render` prop (`<Button render={<Link href="/x" />}>`), there is no `asChild`.
- Next.js 16: route `params` is a Promise (`await ctx.params`, type with `RouteContext<"/api/x/[id]">`); `cookies()` / `headers()` are async. `cacheComponents` is off. Bundled docs: `web/node_modules/next/dist/docs/`.
- Deployment is optional. If needed, any host with HTTPS works; rpID must match the domain.

## Decisions

- SQLite + in-DB challenges instead of Postgres + Redis: one process, zero setup, enough for a demo.
- Polling instead of SSE for device-link status: simpler, 2 s interval is fine.
- Only canned gestures (no custom gesture): random prompts are what defeat replay; custom gestures add enrollment work for little security.
- No email: notifications are in-app only. Recovery alerts reach any still-signed-in device.
- Foundation (schema, sessions, WebAuthn helpers, stubs) built on `main` before the parallel agents start: removes every shared-file conflict and lets the four branches merge cleanly.
- Migrations generated once with drizzle-kit and applied automatically by the DB client: zero setup per worktree.
- IDs that come from WebAuthn (credential id, user handle bytes) stored as base64url text, not blobs: matches `@simplewebauthn` types, no conversions.
- Device link: every approver-side error (bad binding cookie, bad nonce, link not pending) is 404 `NOT_FOUND`, so link ids can't be probed; status transitions are compare-and-set on `status`, so a double submit can't approve or register twice.
- Admins may revoke a user's last credential (the user then goes through recovery); users get `LAST_CREDENTIAL` for their own last one.
- `admin_action` events are logged on the admin's user id with `metadata {action, target, targetUserId}`; the owner gets its own `credential_revoked` / `recovery_cancelled` event.
- Phishing rows in the admin feed: a `login_fail` with `metadata.reason = "origin_mismatch"` is rendered as "Blocked: sign-in from a fake site".
- Step-up liveness challenges use `targetId = session.id` (attempts per risky login); recovery liveness uses `targetId = recoveryId` and is additionally capped per request from `recovery_liveness_fail` events.
