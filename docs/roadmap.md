# Roadmap

Milestones M1–M6 are built in parallel by four agents (see `docs/agents/workflow.md`); the agent column says who. Only the master reviewer ticks this file, at merge time. Agents track progress in their own brief.

| Milestone | Agent |
|---|---|
| M1 Passkeys, M6 `/home` + notifications | A `auth` (`docs/agents/auth.md`) |
| M2 Face + gesture liveness | B `bio` (`docs/agents/bio.md`) |
| M3 Devices, M5 admin, M6 `/activity` | C `devices` (`docs/agents/devices.md`) |
| M4 Recovery, M5 phishing demo, M6 threat model | D `recovery` (`docs/agents/recovery.md`) |
| Merge, integration, demo rehearsal | master (`docs/agents/reviewer.md`) |

## M0: Scaffold (master, done on `main`)
- [x] `web/`: create-next-app (TS, Tailwind, App Router), shadcn, zod, Drizzle + better-sqlite3, Vitest
- [x] Full schema from `docs/data-model.md`, env module, `config.ts`, `events.ts`, sessions, WebAuthn helpers, contract stubs (`docs/foundation.md`)
- [x] `bio/`: uv project, FastAPI `/healthz`, internal token check, `BIO_FAKE` mode, model download script (moved to agent B)

## M1: Passkeys
- [x] Register, login, logout, sessions, `requireSession`, reauth
- [x] signCount clone check
- [x] Sign-up wizard (steps 1, 2, 4, 5), sign-in page
- [x] Recovery code generation + regenerate on `/security`

## M2: Face + gesture liveness (USP)
- [x] bio: face enroll (embed + encrypt), verify pipeline per `docs/biometrics.md`, pytest for the decision logic
- [x] web: camera capture component (frames + timestamps, prompt cards, voice)
- [x] Sign-up step 3 enrollment, enroll/delete on `/security`
- [x] Risk check + step-up flow + "Simulate location" toggle
- [x] Custom gesture: user sets their own hand shape at enrollment; checks ask for it + 1 random canned sign (`docs/biometrics.md#custom-gesture`)
- [ ] Calibrate thresholds with team captures (face + `scripts/calibrate_pose.py` for the custom gesture), record in `docs/biometrics.md#decisions`

## M3: Devices
- [x] QR device link (start, approve, register, polling)
- [x] `/devices`: list, rename, remove (reauth), removed section
- [x] Add security key

## M4: Recovery
- [x] State machine + unit tests
- [x] Start, liveness, cooldown, cancel banner on active sessions, complete

## M5: Admin + phishing demo
- [x] Admin pages + revoke / cancel recovery
- [x] `phish/` clone and attacks 1–4

## M6: Submission
- [x] `/home`, `/activity`, notifications, voice buttons, 360 px pass
- [x] Threat model page or PDF from `docs/security.md`
- [ ] Rehearse demo script

## Demo script
1. Sign up, enroll face + your own gesture, save recovery code. Sign in normally.
2. Simulate new country → step-up. Fail with a photo / phone video, pass live.
3. Add a laptop by QR, remove the old phone.
4. Phishing clone: every attack fails.
5. Recovery: code + liveness, cancel banner on another session, complete with shortened cooldown.
6. Admin: devices, login history, revoked credentials, blocked attempts.

## Stretch (only if time is left)
- Anti-spoof model, moving custom gestures, live in-browser prompt ticking (`docs/biometrics.md#stretch`)
- Hindi UI strings
- Email alerts for recovery
- Playwright e2e with a virtual authenticator
- Deploy to a real domain
