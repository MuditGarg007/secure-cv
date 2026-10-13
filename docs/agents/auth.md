# Agent A: auth (passkeys, sessions, risk, sign-up/sign-in, account pages)

Worktree `~/secure-auth`, branch `agent/auth`, web port **3100** (`ORIGIN=http://localhost:3100`). Follow `docs/agents/workflow.md` strictly. Your scope check: `scripts/check-scope.sh auth`.

**Read**: `ps.md`, `docs/foundation.md`, `docs/auth.md`, `docs/api.md` (Auth + Account), `docs/flows.md` (§1, §2, §7), `docs/security.md`, `docs/data-model.md`.

## Mission
Make passkey sign-up, sign-in (with risk check), reauth and logout work end to end, plus the account pages. Everyone else's flows start from a session you create, so ship the API routes first, pages second.

## You own
`web/src/app/page.tsx`, `web/src/app/signup/**`, `web/src/app/signin/page.tsx`, `web/src/app/signin/_components/**`, `web/src/app/home/**`, `web/src/app/security/**`, `web/src/app/api/auth/**`, `web/src/app/api/me/**`, `web/src/server/auth/**` (foundation files inside: bugfix only, exported API frozen), `web/src/server/risk.ts` + `risk.test.ts`, `web/src/components/auth/**`, the `auth` section of `web/src/server/config.ts`, `docs/auth.md`, this file.

NOT yours: `/signin/step-up` (B), `/devices`, `/link`, `/activity`, `/admin` (C), `/recover` (D).

## Tasks (in this order)

### 1. API routes (`docs/api.md` Auth + Account)
- [ ] `POST /api/auth/register/options` `{handle, displayName}`: lowercase + `HANDLE_RE`, 409 `HANDLE_TAKEN` if exists. Don't create the user yet: `startRegistration({purpose:"register", user:{webauthnUserId: newWebauthnUserId(), handle, displayName}, data:{handle, displayName, webauthnUserId}})` → `{options}`.
- [ ] `POST /api/auth/register/verify` `{response}`: `finishRegistration`, then in one transaction insert the user from `challenge.data` (unique violation → `HANDLE_TAKEN`) and `saveCredential` with `labelFromUA`. `createSession`, `logEvent("register")`. → `{ok:true}`.
- [ ] `POST /api/auth/login/options` → discoverable `startAuthentication({purpose:"login"})`.
- [ ] `POST /api/auth/login/verify` `{response}`: `finishAuthentication({purpose:"login"})`, then the risk check (task 2), then:
  - `allow`: `createSession`, `login_success` event with `riskScore`/`riskSignals` → `{status:"ok"}`
  - `step_up` and user has a face (`hasFace`): `createSession({stepUpPending:true})`, `step_up_required` event → `{status:"step_up", reason:<top signal category>}`
  - `step_up` without face, or `block`: no session, `blocked` event, `notify(user, "We blocked a sign-in from <country/device>...")`, throw `BLOCKED`.
- [ ] `POST /api/auth/reauth/options|verify`: `requireSession()`, `startAuthentication({purpose:"reauth", userId})`, `finishAuthentication({purpose:"reauth", expectedUserId})`, `markReauth`, `reauth` event.
- [ ] `POST /api/auth/logout`: `requireSession({allowPending:true})`, `endCurrentSession`, `logout` event.
- [ ] `POST /api/me/recovery-code`: `requireSession({reauth:true})`, `issueRecoveryCode`, `recovery_code_generated` event → `{code}`. Never log the code.
- [ ] `POST /api/me/notifications/read` `{ids}`.

### 2. Risk check
- [ ] `web/src/server/risk.ts`: pure `risk(input) → {score, signals, decision}` per `docs/auth.md#risk-check`, weights/thresholds from config. Input is plain data (current country, current UA family, previous UA family, past successful-login countries, recent failure count); no DB imports in this file.
- [ ] `web/src/server/risk.test.ts`: every signal, every threshold edge, first login = 0, unknown country skips `new_country`.
- [ ] Data gathering (impure) in `web/src/server/auth/login.ts` (new file): countries from this user's past `login_success`, `step_up_pass` and `register` events; `login_fail` count for the user in the last 15 min; `uaFamily(previous.lastUsedUa)` vs current.

### 3. Pages
- [ ] `/` landing: what this is (no passwords, no OTP), big "Sign in" and "Create account", 🔊.
- [ ] `/signup` wizard per `docs/flows.md §1`: (1) handle + display name, (2) passkey via `registerPasskey`, (3) `<FaceEnrollPanel allowSkip onDone>` (B's stub; skip warning text from flows.md), (4) recovery code from `/api/me/recovery-code`, shown `XXXX-XXXX-...` with Copy / Print, "I saved it" checkbox required, (5) → `/home`.
- [ ] `/signin`: conditional UI autofill (`autocomplete="username webauthn"` + `authenticatePasskey({autofill:true})`), big "Sign in with passkey" button, "Use phone or security key" (same ceremony; the browser offers hybrid QR / USB / NFC), "Lost my device?" → `/recover`. Honour `?next=` (relative paths only). On `step_up` → `/signin/step-up`. On `BLOCKED` → "We stopped this sign-in. Check your other devices."
- [ ] Hidden "Simulate location" toggle on `/signin`, rendered only when `env.DEBUG_RISK === "1"` (pass a boolean prop from the server component): pick a country code, stored in `localStorage`, sent as `X-Debug-Country` header on `login/verify` (and options) via the `headers` option.
- [ ] `/home` (`requirePageSession`): `<RecoveryBanner userId>` (D's stub) on top, unread notifications with "Mark read", last sign-in time + country, quick links (Devices, Add a device → `/link`, Activity, Security).
- [ ] `/security`: `<FaceSettings enrolled={hasFace(user)} />` (B's stub) and "New recovery code" (`withReauth(() => api("/api/me/recovery-code", ...))`, show once + confirm saved).

### 4. Wrap-up
- [ ] Manual run on port 3100 with Chrome DevTools virtual authenticator: sign up, sign out, sign in, simulate a new country → step-up response (page 404s until B merges; fine), block path, reauth via recovery-code regenerate.
- [ ] Update `docs/auth.md` if anything changed (e.g. Decisions). Fill Handoff.

## Contracts you provide (others call these URLs; keep them exactly as `docs/api.md`)
- `/api/auth/reauth/options|verify` (used by `withReauth` everywhere), `/api/auth/logout` (header sign-out).
- `/signin?next=<relative path>` (C sends signed-out approvers here).
- Sessions created by you are what B's step-up completes (`step_up_pending`).

## Status
_Tick as you commit._

## Decisions

## Handoff
