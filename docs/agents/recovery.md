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
- [ ] `web/src/server/recovery/machine.ts`: pure `transition(request, event, now, cfg) → {state, cooldownUntil?} | error` for every edge in `docs/flows.md#recovery-state-machine`, incl. lazy `cooling_down → ready` and 48 h idle `→ expired`. Cooldown: 24 h `code_liveness`, 72 h `code_only`, both replaced by `RECOVERY_COOLDOWN_OVERRIDE_S` when set (pass it in; no env import in this file).
- [ ] `machine.test.ts`: one test per edge + every illegal event per state.

### 2. API (`docs/api.md` Recovery)
- [ ] `POST /api/recovery/start` `{handle, code}`: `getUserByHandle` + `checkRecoveryCode` (pass `null` for unknown handle so timing matches); any failure → generic 400 `RECOVERY_INVALID`. Existing open request → also `RECOVERY_INVALID` (don't leak; record decision). Create request (`code_liveness` if `hasFace` else `code_only`), `setBindingCookie(RECOVERY_BIND_COOKIE, ...)` → store hash. `recovery_started` event, `notify(user, "Recovery started for your account. Not you? Cancel it.")`. Code is NOT marked used until completion. → `{recoveryId, next:"liveness"|"cooldown"}`.
- [ ] `GET /api/recovery/:id` (binding cookie) → `{state, method, cooldownUntil?}` with lazy transitions applied and persisted.
- [ ] `POST /api/recovery/:id/liveness/challenge|verify` (binding cookie, state `pending_liveness`): B's liveness functions; pass → `cooling_down` + `recovery_liveness_pass` event; fail → `recovery_liveness_fail`; 0 attempts → `cancelled` + `recovery_cancelled`. Return `toClientResult` only.
- [ ] `POST /api/recovery/:id/cancel`: full session of the owner, or admin+reauth via `/api/admin/recovery/:id/cancel` (`admin_action` event too). `recovery_cancelled` event with `cancelled_by`.
- [ ] `POST /api/recovery/:id/complete/options|verify` (binding cookie, state `ready`): `startRegistration({purpose:"recovery_register", userId, targetId: recoveryId, user})` (no exclude: old creds are being replaced); verify → in one transaction: revoke ALL the user's credentials (reason `recovery`) and sessions, `saveCredential`, `markRecoveryCodeUsed`, state `completed`; then `issueRecoveryCode` (new code), `createSession`, `recovery_completed` event, `notify`. → `{ok, newRecoveryCode}`. Clear the binding cookie.

### 3. Pages
- [ ] `/recover`: handle + recovery code inputs (code input tolerant of dashes/spaces/lowercase), explanation of what happens next, 🔊 on every step.
- [ ] `/recover/[id]`: drives the state from `GET /api/recovery/:id`: `pending_liveness` → `<LivenessCheck>`; `cooling_down` → countdown + "We alerted your signed-in devices. Come back on this browser after <time>." (poll or refresh); `ready` → "Create new passkey" (`registerPasskey`), then show the new recovery code with Copy/Print + "I saved it" → `/home`; `cancelled`/`expired` → explanation + start over.
- [ ] Banner + admin component (contracts above).

### 4. Phishing demo (`docs/phishing-demo.md`, you own it)
- [ ] `phish/`: own `package.json` (plain Node ESM + Playwright as a dev dep is fine), `server.mjs` on `127.0.0.1:<PHISH_PORT>` serving `index.html` (a look-alike `/signin` with one button per attack and a log panel) and proxying `/api/*` to `REAL_ORIGIN`. Ports/origins from env with defaults for the final demo (`REAL_ORIGIN=http://localhost:3000`, port 3001); you test with `REAL_ORIGIN=http://localhost:3400 PHISH_PORT=3401`.
- [ ] Attacks 1–4 + optional 5 per the doc. Attack 3: Playwright + CDP virtual authenticator; register a passkey on the real origin, export its private key with `WebAuthn.getCredentials`, sign an assertion over a `clientDataJSON` whose origin is the clone, post it to the real `/api/auth/login/verify` with a forged `Origin: <real origin>` header so the CSRF check passes and the signed-origin check is what rejects it (`ORIGIN_MISMATCH` + `login_fail reason=origin_mismatch`). Document this in the doc. Login routes come from A, so attack 3 is verified fully after merge; write the script so the master can run it with one command.
- [ ] `phish/README.md` or doc section: exact commands to run the demo and what each attack should print.

### 5. Threat model deliverable
- [ ] Keep `docs/security.md` accurate to what was actually built (you may edit it).
- [ ] `/threat-model` page (public): the covered / partially / not-covered tables, readable on a phone and printable (print CSS), so it can be shown or saved as PDF for the submission.

### 6. Wrap-up
- [ ] Manual test on 3400: `code_only` recovery end to end with `RECOVERY_COOLDOWN_OVERRIDE_S=60` (`pnpm dev:session alice --code` creates the user, a session for the banner/cancel side, and prints a valid recovery code; `--face` makes it a `code_liveness` user). Fill Handoff.

## Status
_Tick the task boxes above as you commit; short progress notes here._

## Decisions

## Handoff
