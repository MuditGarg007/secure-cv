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
- [x] `POST /api/auth/register/options` `{handle, displayName}`: lowercase + `HANDLE_RE`, 409 `HANDLE_TAKEN` if exists. Don't create the user yet: `startRegistration({purpose:"register", user:{webauthnUserId: newWebauthnUserId(), handle, displayName}, data:{handle, displayName, webauthnUserId}})` → `{options}`.
- [x] `POST /api/auth/register/verify` `{response}`: `finishRegistration`, then in one transaction insert the user from `challenge.data` (unique violation → `HANDLE_TAKEN`) and `saveCredential` with `labelFromUA`. `createSession`, `logEvent("register")`. → `{ok:true}`.
- [x] `POST /api/auth/login/options` → discoverable `startAuthentication({purpose:"login"})`.
- [x] `POST /api/auth/login/verify` `{response}`: `finishAuthentication({purpose:"login"})`, then the risk check (task 2), then:
  - `allow`: `createSession`, `login_success` event with `riskScore`/`riskSignals` → `{status:"ok"}`
  - `step_up` and user has a face (`hasFace`): `createSession({stepUpPending:true})`, `step_up_required` event → `{status:"step_up", reason:<top signal category>}`
  - `step_up` without face, or `block`: no session, `blocked` event, `notify(user, "We blocked a sign-in from <country/device>...")`, throw `BLOCKED`.
- [x] `POST /api/auth/reauth/options|verify`: `requireSession()`, `startAuthentication({purpose:"reauth", userId})`, `finishAuthentication({purpose:"reauth", expectedUserId})`, `markReauth`, `reauth` event.
- [x] `POST /api/auth/logout`: `requireSession({allowPending:true})`, `endCurrentSession`, `logout` event.
- [x] `POST /api/me/recovery-code`: `requireSession({reauth:true})`, `issueRecoveryCode`, `recovery_code_generated` event → `{code}`. Never log the code.
- [x] `POST /api/me/notifications/read` `{ids}`.

### 2. Risk check
- [x] `web/src/server/risk.ts`: pure `risk(input) → {score, signals, decision}` per `docs/auth.md#risk-check`, weights/thresholds from config. Input is plain data (current country, current UA family, previous UA family, past successful-login countries, recent failure count); no DB imports in this file.
- [x] `web/src/server/risk.test.ts`: every signal, every threshold edge, first login = 0, unknown country skips `new_country`.
- [x] Data gathering (impure) in `web/src/server/auth/login.ts` (new file): countries from this user's past `login_success`, `step_up_pass` and `register` events; `login_fail` count for the user in the last 15 min; `uaFamily(previous.lastUsedUa)` vs current.

### 3. Pages
- [x] `/` landing: what this is (no passwords, no OTP), big "Sign in" and "Create account", 🔊.
- [x] `/signup` wizard per `docs/flows.md §1`: (1) handle + display name, (2) passkey via `registerPasskey`, (3) `<FaceEnrollPanel allowSkip onDone>` (B's stub; skip warning text from flows.md), (4) recovery code from `/api/me/recovery-code`, shown `XXXX-XXXX-...` with Copy / Print, "I saved it" checkbox required, (5) → `/home`.
- [x] `/signin`: conditional UI autofill (`autocomplete="username webauthn"` + `authenticatePasskey({autofill:true})`), big "Sign in with passkey" button, "Use phone or security key" (same ceremony; the browser offers hybrid QR / USB / NFC), "Lost my device?" → `/recover`. Honour `?next=` (relative paths only). On `step_up` → `/signin/step-up`. On `BLOCKED` → "We stopped this sign-in. Check your other devices."
- [x] Hidden "Simulate location" toggle on `/signin`, rendered only when `env.DEBUG_RISK === "1"` (pass a boolean prop from the server component): pick a country code, stored in `localStorage`, sent as `X-Debug-Country` header on `login/verify` (and options) via the `headers` option.
- [x] `/home` (`requirePageSession`): `<RecoveryBanner userId>` (D's stub) on top, unread notifications with "Mark read", last sign-in time + country, quick links (Devices, Add a device → `/link`, Activity, Security).
- [x] `/security`: `<FaceSettings enrolled={hasFace(user)} />` (B's stub) and "New recovery code" (`withReauth(() => api("/api/me/recovery-code", ...))`, show once + confirm saved).

### 4. Wrap-up
- [x] Manual run on port 3100 with Chrome DevTools virtual authenticator: sign up, sign out, sign in, simulate a new country → step-up response (page 404s until B merges; fine), block path, reauth via recovery-code regenerate.
- [x] Update `docs/auth.md` if anything changed (e.g. Decisions). Fill Handoff.

## Contracts you provide (others call these URLs; keep them exactly as `docs/api.md`)
- `/api/auth/reauth/options|verify` (used by `withReauth` everywhere), `/api/auth/logout` (header sign-out).
- `/signin?next=<relative path>` (C sends signed-out approvers here).
- Sessions created by you are what B's step-up completes (`step_up_pending`).

## Status
_Tick as you commit._ All task checkboxes above are ticked: every item is committed on `agent/auth`.
- [x] Risk check + tests (`a67c71f`)
- [x] Auth + account API routes (`81c63c7`)
- [x] Sign-in page, autofill, `?next=`, simulate location (`d0b95e4`)
- [x] Landing, sign-up wizard, /home, /security (`0a4e641`)
- [x] Autofill hydration race + Base UI link-button fix (`8d2c317`)
- [x] Manual run on port 3100 (headless Chromium with a CDP WebAuthn virtual authenticator) + docs + handoff

## Decisions
- Risk / session decisions are recorded in `docs/auth.md#decisions`.
- The face-skip warning ("Without this, unusual sign-ins get blocked and recovery takes 3 days.") is left to `FaceEnrollPanel` (its `allowSkip` prop documents it), so the wizard doesn't show it twice after merge.
- The sign-up wizard redirects signed-in users away from `/signup`. If someone reloads mid-wizard after the passkey step, they land on `/home`, which shows a "make a recovery code" nudge whenever the user has no active code.
- `/home` shows the two most recent sign-ins ("This sign-in" / "Before that") from `login_success`, `step_up_pass`, `register` and `recovery_completed` events.
- The passkey autofill (conditional UI) on `/signin` waits for hydration before it starts, so its `X-Debug-Country` header uses the stored country and not the SSR default.
- "Use phone or security key" runs the same discoverable ceremony as the main button: the browser's own picker offers hybrid QR, USB and NFC.

## Handoff

**Done** (try it on http://localhost:3100 with `DEBUG_RISK=1`):
- `/` landing → `/signup`: handle + name → passkey → face step (B's stub, "Skip for now") → recovery code (Copy / Print, "I saved it" required) → `/home`.
- `/signin`: passkey autofill on the username field, "Sign in with passkey", "Use phone or security key", "Lost my device?" → `/recover`, `?next=` (relative only). Expand "Demo: simulate location" at the bottom to pick a country.
  - Same country → `/home`. Other country with no face enrolled → "We stopped this sign-in…" plus a notification on `/home`. Other country with a face → `{status:"step_up"}` and a pending session → `/signin/step-up` (404 until B merges). Score ≥ 80 (new country + new browser + 3 recent failures) → blocked even with a face.
- `/home`: `RecoveryBanner` (D's stub), alerts with Mark read / Mark all read, last two sign-ins (time · country · device), recovery-code nudge, quick links.
- `/security`: `FaceSettings` (B's stub) and "New recovery code" (confirm → `withReauth` → shown once → "I saved it").
- API: every Auth + Account route in `docs/api.md`. `withReauth` works against `/api/auth/reauth/*`; logout also works with a step-up-pending session.

**Not done / known issues**:
- `/signin/step-up` (B), `/recover` (D), `/devices`, `/link`, `/activity` (C) are linked but 404 on this branch, as expected.
- No real-device test (no physical authenticator here). Tests used a software authenticator and Chromium's CDP virtual authenticator.
- In headless Chromium the virtual authenticator completes the conditional-UI (autofill) request without any user action. Real browsers wait for the user to pick a passkey, so this only matters for automated tests.
- Commit `d0b95e4` imports `components/auth/SimulateLocation`, which only lands in `0a4e641`, so `d0b95e4` alone doesn't build. Every later commit is green.

**REQUEST / BUG / DOC**:
- DOC `docs/foundation.md` and `docs/agents/workflow.md` §5: the `<Button render={<Link …/>}>` example also needs `nativeButton={false}`. Without it Base UI logs a console error ("expected a native <button> because the `nativeButton` prop is true") on every render. C and D should use the same prop.
- BUG (cosmetic, master) `web/src/app/globals.css:10`: `--font-sans: var(--font-sans);` refers to itself, so the Geist font loaded in `layout.tsx` (`--font-geist-sans`) is never used and pages fall back to serif. Patch: `--font-sans: var(--font-geist-sans);`.

**Test evidence**:
- `cd web && pnpm typecheck && pnpm lint && pnpm test` → typecheck OK, eslint 0 problems, 16/16 tests (`risk.test.ts`, `safe-next.test.ts`, `ua.test.ts`).
- `pnpm build` → OK, all routes compile.
- API E2E (throwaway node script with a software P-256 authenticator, not committed): 25/25 checks covering register, `HANDLE_TAKEN`, recovery code, logout, allow, reauth + replay rejected, new country without face → BLOCKED, UA change alone → allow, unknown country → allow, counter regression → BLOCKED (clone), step-up with face (pending session blocked from APIs, `/home` → `/signin/step-up`, logout allowed), score 80 → BLOCKED, `last_used_ua` restored, phishing origin → `ORIGIN_MISMATCH`.
- UI E2E (headless Chromium + CDP WebAuthn virtual authenticator at 360 px, throwaway): 21/21 checks covering the sign-up wizard, sign-out, sign-in, `?next=/security`, recovery-code regeneration through a stale-reauth passkey check, blocked US sign-in, step-up redirect with a face, alerts + Mark read. No console errors.
- `scripts/check-scope.sh auth` → OK.
