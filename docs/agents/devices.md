# Agent C: devices + admin (QR device link, device list/revoke, security keys, activity, admin view)

Worktree `~/secure-devices`, branch `agent/devices`, web port **3300** (`ORIGIN=http://localhost:3300`). Follow `docs/agents/workflow.md` strictly. Your scope check: `scripts/check-scope.sh devices`.

**Read**: `ps.md` (req. 4 and 7), `docs/foundation.md`, `docs/api.md` (Devices, Admin writes), `docs/flows.md` (§4, §5, §7 activity, §8), `docs/auth.md` (sessions, reauth, approvals), `docs/data-model.md` (`credentials`, `device_links`, `auth_events`), `docs/security.md`.

## Mission
Multi-device support (add a device by QR with a trusted device, add a security key, rename, revoke a lost device) and the admin view (registered devices, login history, revoked credentials). Also the user's own `/activity` page.

## You own
`web/src/app/devices/**`, `web/src/app/link/**`, `web/src/app/activity/**`, `web/src/app/admin/**`, `web/src/app/api/devices/**`, `web/src/app/api/link/**`, `web/src/app/api/admin/credentials/**`, `web/src/server/devices/**`, `web/src/server/admin/**`, `web/src/components/devices/**`, `web/src/components/admin/**`, `web/src/components/events/**`, the `devices + admin` section of `web/src/server/config.ts`, this file.

NOT yours: `/api/admin/recovery/**` and the recovery list on the admin page (D: you render D's `<AdminRecoveryRequests userId>` stub).

## Tasks

### 1. Devices API
- [x] `PATCH /api/devices/:id` `{label}` (own, active credential only).
- [x] `POST /api/devices/:id/revoke` `{reason:"lost"|"user"}` full+reauth: own credential, 409 `LAST_CREDENTIAL` if it's the only active one, `revokeCredential`, `credential_revoked` event, `notify`. If it is the current session's credential, `endCurrentSession` too (response tells the client to go to `/`).
- [x] `POST /api/devices/key/options|verify` full+reauth: `startRegistration({purpose:"add_key", userId, excludeUserId:userId, user})`, `finishRegistration`, `saveCredential` with the given label (default "Security key"), `credential_added` event.

### 2. QR device link (`docs/flows.md §4`), all state in `device_links`
- [x] `POST /api/link/start` (no auth): random `nonce` (`randomToken`), 6-digit `shortCode` (`randomDigits`), `setBindingCookie(LINK_BIND_COOKIE, LINK_TTL_MS)`, `requesterUa`, expires +`LINK_TTL_MS` → `{linkId, shortCode, qrUrl: ORIGIN/link/<id>#<nonce>}`.
- [x] `GET /api/link/:id/status` (binding cookie must match) → `{status}`; expired → `LINK_EXPIRED`.
- [x] `GET /api/link/:id?n=<nonce>` (full session) → `{shortCode, ua, createdAt}`; 404 on bad nonce / expired / not pending.
- [x] `POST /api/link/:id/approve/options` `{nonce}` + `/approve/verify` `{response, decision}` (full session): `startAuthentication({purpose:"link_approve", userId, targetId:linkId})`, `finishAuthentication({..., targetId:linkId, expectedUserId})`. Approve → `status=approved, user_id=approver`, `markReauth(approver session)`. Deny → `denied`. Log `device_linked` with `metadata.stage = "approved" | "denied"` (and `"registered"` at completion, below).
- [x] `POST /api/link/:id/register/options|verify` (binding cookie, link `approved`): `startRegistration({purpose:"link_register", userId: link.userId, excludeUserId, targetId:linkId, user})`; verify → `saveCredential` (label `labelFromUA`), `status=consumed`, `createSession` for the new device, `device_linked` event, `notify(user, "New device added: <label>")`.

### 3. Pages
- [x] `/link` (new device, no session): start, show QR (`qrcode` → data URL) + big 6-digit code + "Scan with your signed-in phone", poll status every `LINK_POLL_MS`; on `approved` run `registerPasskey` against `/api/link/:id/register/*` → `/home`; `denied`/expired → message + "Try again".
- [x] `/link/[id]` (existing device, opened by scanning): nonce comes from `location.hash` (client only). If not signed in, send to `/signin?next=<encoded /link/id#nonce>` (build it client-side; servers never see the hash). Show the short code + requester browser, "Is the same code on the other screen?" big Approve / Deny, approve runs `authenticatePasskey` with `verifyBody:{decision}`.
- [x] `/devices`: active devices (label, created, last used, "this device" badge), rename inline, Remove → dialog "I lost it" / "I don't use it anymore" → `withReauth` → revoke; "Removed devices" section with reason + date; "Add a device" (→ `/link` instructions: open `/link` on the new device) and "Add card or security key" (`withReauth` + `registerPasskey` against `/api/devices/key/*`).
- [x] `/activity`: this user's `auth_events`, newest first, icons ✓ allowed / ⚠ step-up / ⛔ blocked / 🔑 device changes, time, country, device label. Build a reusable `components/events/EventList.tsx` (server component) used here and in admin. Never show `metadata` blobs to the user; admin may see risk signals.
- [x] `/admin` (`requirePageSession({admin:true})`): users list (handle, devices count, face enrolled y/n, last login) → `/admin/users/[id]`: devices active + removed with reason, events with risk score + signals, `<AdminRecoveryRequests userId>` (D's stub), Revoke button per active credential. Global event feed with a type filter (search param), and a "Revoked credentials" list. Make `login_fail` with `reason=origin_mismatch` stand out (phishing demo shows it here).
- [x] `POST /api/admin/credentials/:id/revoke` admin+reauth: `revokeCredential(id,"admin")`, `admin_action` event `{action:"revoke_credential", target}` + `credential_revoked` event, `notify` the owner.

### 4. Wrap-up
- [x] Manual test on port 3300: dev sessions (`pnpm dev:session`, see `docs/foundation.md#dev-sessions`) for list/rename/revoke/admin pages; real passkeys only work after A merges, so test the link state machine with two browser profiles as far as possible and document what the master must re-test.
- [x] Unit tests for any pure logic you extract (link state/expiry, event → icon mapping).
- [x] Fill Handoff.

## Contracts you provide
- `EventList` and the admin pages: D's phishing demo expects attack 3 (`login_fail`, `metadata.reason = "origin_mismatch"`) to be visible in the admin event feed.
- `/link` and `/link/[id]` URLs (A links to `/link` from `/home`).

## Status
All task items done and committed. Manual testing was done with HTTP scripts and a software authenticator; the browser UI has not been checked by eye (details in Handoff).

## Decisions
- `POST /api/link/start` also returns `expiresAt`. This is an extra field for the client and does not change anything in the contract.
- Link and approver errors return 404 `NOT_FOUND` for every case: wrong binding cookie, bad nonce, or a link that is not pending. This way an attacker can't tell whether a link exists. `status` returns 410 `LINK_EXPIRED` only to the browser that is bound to the link.
- Calling `register/options|verify` before the link is approved returns 403 `FORBIDDEN`. The docs name no code for this case.
- Status changes (`pending→approved/denied`, `approved→consumed`) are compare-and-set updates on `status`, so a double submit can't approve or register twice.
- `register/verify` and `key/verify` also check that `challenge.userId` is the expected user. This blocks a challenge started by one account from being finished by another.
- An approval writes a notification for the approver ("You approved a new device"), and registration writes "New device added: <label>". This gives both a visible trail on `/home`.
- An admin may revoke a user's last credential, because a lost-only-device case has to go through recovery anyway. A user revoking their own last credential gets `LAST_CREDENTIAL`.
- The `admin_action` event is logged with `userId = admin`, and `metadata` holds `{action, target, targetUserId}`. A separate `credential_revoked` event is logged for the owner with `metadata.reason = "admin"`.
- `/activity` and `/admin` show the newest 100 events (`EVENT_LIMIT` in `server/devices/events.ts`). This is a display limit, not a security tunable.
- `/link/[id]` sends a signed-out visitor to `/signin?next=<encoded /link/id#nonce>` and a step-up-pending visitor to `/signin/step-up`. The nonce never leaves the browser except in the `?n=` call that requires a session.
- `/devices` explains "Add a device" in a dialog: open `<ORIGIN>/link` on the new device. It does not start a link from the old device.

## Handoff

**Done** (port 3300):
- APIs: `PATCH /api/devices/:id`, `POST /api/devices/:id/revoke`, `POST /api/devices/key/options|verify`, all of `/api/link/*`, and `POST /api/admin/credentials/:id/revoke`. They follow docs/api.md.
- Pages:
  - `/devices`: rename, remove (with an "I lost it" / "I don't use it anymore" dialog, then `withReauth`), add a card or security key, and a "Removed devices" section.
  - `/link`: QR code, 6-digit code, polls status, then registers a passkey and goes to `/home`.
  - `/link/[id]`: shows the code and the requesting browser, with Approve and Deny.
  - `/activity`.
  - `/admin`: users table, event feed with a type filter, and a list of revoked credentials.
  - `/admin/users/[id]`: active and removed devices, a Revoke button for each device, D's `<AdminRecoveryRequests>`, and events with risk score, signals and reason.
- `components/events/EventList.tsx` is a server component. With the `admin` prop it also shows handle, risk and reason. A `login_fail` with `metadata.reason = "origin_mismatch"` is shown with a red border, a "Phishing" badge, and the label "Blocked: sign-in from a fake site". This is the contract D's phishing demo relies on.
- Pure logic with tests: `server/devices/link-state.ts` (expiry, approve and register rules) and `server/devices/event-view.ts` (maps each event to an icon and label, and covers every event type).

**Not done / known issues**
- The pages were not checked in a browser because the Chrome extension was not connected. The master should look at `/link`, `/link/[id]`, `/devices` and `/admin` at 360 px.
- Not tested yet:
  - Real two-device QR linking with platform passkeys, and the `/signin?next=` round trip. Both need A's `/signin`.
  - `withReauth` with a stale session. It needs A's `/api/auth/reauth/*`.
- Removing the device you are using now returns `{signedOut:true}` and sends the client to `/`. That path is covered by code review only.

**Master re-test after merge**
1. Use browser profile 1 to sign in as alice, then open `/devices` and choose "Add a device".
2. Use browser profile 2 (or a phone) to open `/link`.
3. Open the QR URL in profile 1. Check that the code matches, then Approve and confirm the passkey prompt.
4. Profile 2 should register a passkey and land on `/home`.
5. Check that `/activity` shows the approved and added events.
6. Remove the new device with "I lost it" from profile 1. Profile 2 should be signed out on its next request.
7. As admin, run phishing attack 3 and check that `/admin?type=login_fail` shows the red "Phishing" row.

**REQUEST / BUG / DOC**
- DOC docs/api.md (Devices): `register/options|verify` before approval returns 403 `FORBIDDEN`. Please add that, and add the extra `expiresAt` field in the `/link/start` response.

**Test evidence**
- `cd web && pnpm typecheck && pnpm lint && pnpm test`: clean, 12 tests passed.
- `scripts/check-scope.sh devices`: OK.
- An HTTP end-to-end run used a Node software authenticator (ES256, attestation "none") against `pnpm dev -p 3300` with dev sessions. 42 of 43 checks passed. The one failure was a rename in the first run: the test script could not read the credential ids. Rename passed when run again with ids taken from the DB:
  - add key; stale session → `REAUTH_REQUIRED`; bad Origin → 403
  - link start, then status
  - binding cookie, nonce and session checks
  - register before approval → 403
  - approval assertion from `http://evil.test` → `ORIGIN_MISMATCH` and a `login_fail` origin_mismatch event
  - approve → approved → register → `sid` cookie set and `link_bind` cleared; re-register refused
  - approval challenge replayed on another link → `CHALLENGE_EXPIRED`
  - deny → denied
  - rename, including empty label → 400 and another user's device → 404
  - revoke: stale → `REAUTH_REQUIRED`, bad reason → 400, ok, last one → `LAST_CREDENTIAL`
  - admin revoke: non-admin → 403, ok, repeat → 404
  - `/admin` redirects non-admins; feed, filter and phishing row shown; `/activity`, `/devices` and `/admin/users/[id]` render; bad id → 404
