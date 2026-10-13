# Agent D: recovery + phishing demo + threat model

Worktree `~/secure-recovery`, branch `agent/recovery`, web port **3400** (`ORIGIN=http://localhost:3400`), phishing clone **http://127.0.0.1:3401**. Follow `docs/agents/workflow.md` strictly. Your scope check: `scripts/check-scope.sh recovery`.

**Read**: `ps.md` (req. 2, 3, deliverables), `docs/foundation.md`, `docs/flows.md` (§6 + state machine), `docs/api.md` (Recovery, Admin writes), `docs/security.md` (you own it), `docs/phishing-demo.md` (you own it), `docs/data-model.md` (`recovery_codes`, `recovery_requests`), `docs/biometrics.md` (client response + contracts).

## Mission
Secure account recovery without passwords/OTP (recovery code + liveness + cooldown + alerts + cancel + browser binding), the phishing-resistance demo, and the threat-model deliverable.

## You own
`web/src/app/recover/**`, `web/src/app/api/recovery/**`, `web/src/app/api/admin/recovery/**`, `web/src/app/threat-model/**`, `web/src/server/recovery/**`, `web/src/components/recovery/**`, `phish/**` (its own `package.json`), the `recovery` section of `web/src/server/config.ts`, `docs/security.md`, `docs/phishing-demo.md`, this file.

## Contracts you must fulfil (stubs on `main`, props frozen)
- `web/src/components/recovery/RecoveryBanner.tsx` `{userId}`: server component, A renders it on `/home`. Shows an open request (`pending_liveness | cooling_down | ready`) with when it started and a big **Cancel** button (client child → `POST /api/recovery/:id/cancel`, then `router.refresh()`). Nothing when none.
- `web/src/components/recovery/AdminRecoveryRequests.tsx` `{userId}`: server component, C renders it on the admin user page. All of the user's requests with state/method/cooldown, Cancel on open ones → `withReauth` + `POST /api/admin/recovery/:id/cancel`.

## Contracts you consume
`web/src/server/bio/liveness.ts` (B): `createLivenessChallenge({userId, purpose:"recovery_liveness", targetId: recoveryId})`, `parseLivenessSubmission`, `verifyLiveness`, `toClientResult`. `<LivenessCheck challengeUrl verifyUrl onPassed onFailedFinal>` (B). Until merge they throw `BIO_UNAVAILABLE` / show a placeholder; your routes and page must compile against them and you test the `code_only` path end to end.

## Tasks

### 1. State machine
- [x] `web/src/server/recovery/machine.ts`: pure `transition(request, event, now, cfg) → {state, cooldownUntil?} | error` for every edge in `docs/flows.md#recovery-state-machine`, incl. lazy `cooling_down → ready` and 48 h idle `→ expired`. Cooldown: 24 h `code_liveness`, 72 h `code_only`, both replaced by `RECOVERY_COOLDOWN_OVERRIDE_S` when set (pass it in; no env import in this file).
- [x] `machine.test.ts`: one test per edge + every illegal event per state.

### 2. API (`docs/api.md` Recovery)
- [x] `POST /api/recovery/start` `{handle, code}`: `getUserByHandle` + `checkRecoveryCode` (pass `null` for unknown handle so timing matches); any failure → generic 400 `RECOVERY_INVALID`. Existing open request → also `RECOVERY_INVALID` (don't leak; record decision). Create request (`code_liveness` if `hasFace` else `code_only`), `setBindingCookie(RECOVERY_BIND_COOKIE, ...)` → store hash. `recovery_started` event, `notify(user, "Recovery started for your account. Not you? Cancel it.")`. Code is NOT marked used until completion. → `{recoveryId, next:"liveness"|"cooldown"}`.
- [x] `GET /api/recovery/:id` (binding cookie) → `{state, method, cooldownUntil?}` with lazy transitions applied and persisted.
- [x] `POST /api/recovery/:id/liveness/challenge|verify` (binding cookie, state `pending_liveness`): B's liveness functions; pass → `cooling_down` + `recovery_liveness_pass` event; fail → `recovery_liveness_fail`; 0 attempts → `cancelled` + `recovery_cancelled`. Return `toClientResult` only.
- [x] `POST /api/recovery/:id/cancel`: full session of the owner, or admin+reauth via `/api/admin/recovery/:id/cancel` (`admin_action` event too). `recovery_cancelled` event with `cancelled_by`.
- [x] `POST /api/recovery/:id/complete/options|verify` (binding cookie, state `ready`): `startRegistration({purpose:"recovery_register", userId, targetId: recoveryId, user})` (no exclude: old creds are being replaced); verify → in one transaction: revoke ALL the user's credentials (reason `recovery`) and sessions, `saveCredential`, `markRecoveryCodeUsed`, state `completed`; then `issueRecoveryCode` (new code), `createSession`, `recovery_completed` event, `notify`. → `{ok, newRecoveryCode}`. Clear the binding cookie.

### 3. Pages
- [x] `/recover`: handle + recovery code inputs (code input tolerant of dashes/spaces/lowercase), explanation of what happens next, 🔊 on every step.
- [x] `/recover/[id]`: drives the state from `GET /api/recovery/:id`: `pending_liveness` → `<LivenessCheck>`; `cooling_down` → countdown + "We alerted your signed-in devices. Come back on this browser after <time>." (poll or refresh); `ready` → "Create new passkey" (`registerPasskey`), then show the new recovery code with Copy/Print + "I saved it" → `/home`; `cancelled`/`expired` → explanation + start over.
- [x] Banner + admin component (contracts above).

### 4. Phishing demo (`docs/phishing-demo.md`, you own it)
- [x] `phish/`: own `package.json` (plain Node ESM + Playwright as a dev dep is fine), `server.mjs` on `127.0.0.1:<PHISH_PORT>` serving `index.html` (a look-alike `/signin` with one button per attack and a log panel) and proxying `/api/*` to `REAL_ORIGIN`. Ports/origins from env with defaults for the final demo (`REAL_ORIGIN=http://localhost:3000`, port 3001); you test with `REAL_ORIGIN=http://localhost:3400 PHISH_PORT=3401`.
- [x] Attacks 1–4 + optional 5 per the doc. Attack 3: Playwright + CDP virtual authenticator; register a passkey on the real origin, export its private key with `WebAuthn.getCredentials`, sign an assertion over a `clientDataJSON` whose origin is the clone, post it to the real `/api/auth/login/verify` with a forged `Origin: <real origin>` header so the CSRF check passes and the signed-origin check is what rejects it (`ORIGIN_MISMATCH` + `login_fail reason=origin_mismatch`). Document this in the doc. Login routes come from A, so attack 3 is verified fully after merge; write the script so the master can run it with one command.
- [x] `phish/README.md` or doc section: exact commands to run the demo and what each attack should print.

### 5. Threat model deliverable
- [x] Keep `docs/security.md` accurate to what was actually built (you may edit it).
- [x] `/threat-model` page (public): the covered / partially / not-covered tables, readable on a phone and printable (print CSS), so it can be shown or saved as PDF for the submission.

### 6. Wrap-up
- [x] Manual test on 3400: `code_only` recovery end to end with `RECOVERY_COOLDOWN_OVERRIDE_S=60` (`pnpm dev:session alice --code` creates the user, a session for the banner/cancel side, and prints a valid recovery code; `--face` makes it a `code_liveness` user). Fill Handoff.

## Status
All tasks done. Checks green on `agent/recovery`: `pnpm typecheck`, `pnpm lint`, `pnpm test` (45 tests). Scope check OK.

## Decisions
- `machine.ts` is a single pure `transition(req, event, now, cfg)`; `settle()` applies the two time-based edges (cooldown→ready, idle→expired) lazily on every call, so no cron is needed. `cooling_down` never idle-expires (it waits on the clock, not the user); the 48 h idle clock starts at `cooldownUntil`.
- Cooldown override (`RECOVERY_COOLDOWN_OVERRIDE_S`) is read in `service.ts` and passed into the machine, keeping `machine.ts` env-free and unit-testable.
- `applyEvent` persists with a state-conditional UPDATE (`where state = <read state>`); the loser of a race gets `RECOVERY_STATE`. `complete` runs inside a DB transaction (revoke all creds + sessions, insert new cred, mark code used) gated on that conditional update.
- Liveness attempts capped per *request*, counted from `recovery_liveness_fail` auth_events (metadata.recoveryId), so a fresh challenge can't reset the 3-fail limit.
- A wrong/missing `rec_bind` cookie returns `NOT_FOUND` (same as an unknown id), so recovery ids can't be probed.
- The code marked "used" on completion is the active code created at/before the request start; if the owner rotated it mid-flow, `issueRecoveryCode` supersedes the newer one anyway.
- `RECOVERY_BIND_TTL_MS = 72 h + 48 h` so the binding cookie outlives the longest legally-open request.
- Client countdown corrects for server/browser clock skew using `serverNow` from the status response.
- Phishing clone on `127.0.0.1` (not `*.localhost`); attack 3 exports the private key (strongest attacker) and relies purely on the signed-origin check.

## Handoff
### Done (how to try it, web on :3400)
- `cd web && pnpm dev -p 3400`. Seed a user: `pnpm dev:session alice --code` (prints a recovery code + a session cookie for the banner/cancel side). Add `--face` for a `code_liveness` user.
- **Recovery, code_only end to end**: set `RECOVERY_COOLDOWN_OVERRIDE_S=60` in `web/.env.local` (already set in this worktree). Go to `/recover`, enter the handle + code (dashes/spaces/lowercase all fine) → `/recover/<id>` shows a live countdown, then "Create new passkey" → new recovery code with Copy/Print/"I saved it" → `/home`. Verified end to end with a Playwright CDP virtual authenticator: old credentials revoked (`revoked_reason=recovery`), all old sessions revoked, old recovery code `used`, new code issued, new session cookie set, `rec_bind` cleared, events `recovery_started → credential_revoked → recovery_code_generated → recovery_completed` written.
- **Banner**: `<RecoveryBanner userId>` (A renders on `/home`) shows an open request with timing + a big Cancel button; nothing when none.
- **Admin**: `<AdminRecoveryRequests userId>` (C renders on admin user detail) lists all requests with state/method/cooldown and an admin Cancel (withReauth → `/api/admin/recovery/:id/cancel`).
- **Cancel**: owner session (`/api/recovery/:id/cancel`) and admin+reauth (`/api/admin/recovery/:id/cancel`) both verified; writes `recovery_cancelled` (+`admin_action` for admin) and notifies the owner. Cross-user cancel → NOT_FOUND; stale admin → REAUTH_REQUIRED.
- **Threat model**: `/threat-model` (public, no session), phone-readable + print CSS (save-as-PDF button). Tables mirror `docs/security.md`.
- **Phishing demo**: `phish/` (`pnpm start`, `pnpm attack3`). Attacks 1/2/5 verified against the worktree; 3/4 call agents A/B routes and are fully green on a merged build (before merge the proxy returns 404 for `/api/auth/*` and `/api/stepup/*`). `forge.mjs` signature self-check passes. Full guide in `phish/README.md`.

### Not done / known issues
- Attacks 3 and 4 can only be verified **after merge** (need A's `/api/auth/login/*` and B's `/api/stepup/challenge`). Master: `cd phish && REAL_ORIGIN=http://localhost:3000 PHISH_PORT=3001 pnpm attack3` should exit 0 with `ORIGIN_MISMATCH`; the stepup button should show `401 UNAUTHENTICATED`.
- The liveness path (`pending_liveness`, `<LivenessCheck>`) compiles against B's stubs but renders a placeholder / throws `BIO_UNAVAILABLE` until B is merged; only `code_only` recovery is exercisable now. The routes are written to the frozen `liveness.ts` contract.

### Depends on (consumed contracts)
- B: `web/src/server/bio/liveness.ts` (`createLivenessChallenge`, `parseLivenessSubmission`, `verifyLiveness`, `toClientResult`) and `<LivenessCheck>`. Used by the two liveness routes and `/recover/[id]`.
- A: `/api/auth/login/options|verify` (phishing attack 3) and `/home` rendering `<RecoveryBanner>`.
- C: admin user-detail page rendering `<AdminRecoveryRequests>`.

### REQUEST / BUG / DOC
- None. No foundation changes needed; `webauthn.ts`, `sessions.ts`, `recovery-code.ts`, `challenges.ts` used as-is.

### Test evidence
- `cd web && pnpm typecheck && pnpm lint && pnpm test` → types OK, lint clean, **45 tests pass** (machine edges + illegal events, risk).
- `scripts/check-scope.sh recovery` → OK (only the shared `config.ts` recovery section touched).
- Manual API probes on :3400 (bad code / unknown handle / missing origin / second open request → generic `RECOVERY_INVALID` or `FORBIDDEN`; binding-cookie enforcement; cancel auth matrix; admin reauth). Full `code_only` recovery via Playwright CDP virtual authenticator, DB state asserted. `/threat-model` and banner/admin rendered and screenshot-checked at 360 px.
