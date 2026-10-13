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
- [ ] `PATCH /api/devices/:id` `{label}` (own, active credential only).
- [ ] `POST /api/devices/:id/revoke` `{reason:"lost"|"user"}` full+reauth: own credential, 409 `LAST_CREDENTIAL` if it's the only active one, `revokeCredential`, `credential_revoked` event, `notify`. If it is the current session's credential, `endCurrentSession` too (response tells the client to go to `/`).
- [ ] `POST /api/devices/key/options|verify` full+reauth: `startRegistration({purpose:"add_key", userId, excludeUserId:userId, user})`, `finishRegistration`, `saveCredential` with the given label (default "Security key"), `credential_added` event.

### 2. QR device link (`docs/flows.md §4`), all state in `device_links`
- [ ] `POST /api/link/start` (no auth): random `nonce` (`randomToken`), 6-digit `shortCode` (`randomDigits`), `setBindingCookie(LINK_BIND_COOKIE, LINK_TTL_MS)`, `requesterUa`, expires +`LINK_TTL_MS` → `{linkId, shortCode, qrUrl: ORIGIN/link/<id>#<nonce>}`.
- [ ] `GET /api/link/:id/status` (binding cookie must match) → `{status}`; expired → `LINK_EXPIRED`.
- [ ] `GET /api/link/:id?n=<nonce>` (full session) → `{shortCode, ua, createdAt}`; 404 on bad nonce / expired / not pending.
- [ ] `POST /api/link/:id/approve/options` `{nonce}` + `/approve/verify` `{response, decision}` (full session): `startAuthentication({purpose:"link_approve", userId, targetId:linkId})`, `finishAuthentication({..., targetId:linkId, expectedUserId})`. Approve → `status=approved, user_id=approver`, `markReauth(approver session)`. Deny → `denied`. Log `device_linked` with `metadata.stage = "approved" | "denied"` (and `"registered"` at completion, below).
- [ ] `POST /api/link/:id/register/options|verify` (binding cookie, link `approved`): `startRegistration({purpose:"link_register", userId: link.userId, excludeUserId, targetId:linkId, user})`; verify → `saveCredential` (label `labelFromUA`), `status=consumed`, `createSession` for the new device, `device_linked` event, `notify(user, "New device added: <label>")`.

### 3. Pages
- [ ] `/link` (new device, no session): start, show QR (`qrcode` → data URL) + big 6-digit code + "Scan with your signed-in phone", poll status every `LINK_POLL_MS`; on `approved` run `registerPasskey` against `/api/link/:id/register/*` → `/home`; `denied`/expired → message + "Try again".
- [ ] `/link/[id]` (existing device, opened by scanning): nonce comes from `location.hash` (client only). If not signed in, send to `/signin?next=<encoded /link/id#nonce>` (build it client-side; servers never see the hash). Show the short code + requester browser, "Is the same code on the other screen?" big Approve / Deny, approve runs `authenticatePasskey` with `verifyBody:{decision}`.
- [ ] `/devices`: active devices (label, created, last used, "this device" badge), rename inline, Remove → dialog "I lost it" / "I don't use it anymore" → `withReauth` → revoke; "Removed devices" section with reason + date; "Add a device" (→ `/link` instructions: open `/link` on the new device) and "Add card or security key" (`withReauth` + `registerPasskey` against `/api/devices/key/*`).
- [ ] `/activity`: this user's `auth_events`, newest first, icons ✓ allowed / ⚠ step-up / ⛔ blocked / 🔑 device changes, time, country, device label. Build a reusable `components/events/EventList.tsx` (server component) used here and in admin. Never show `metadata` blobs to the user; admin may see risk signals.
- [ ] `/admin` (`requirePageSession({admin:true})`): users list (handle, devices count, face enrolled y/n, last login) → `/admin/users/[id]`: devices active + removed with reason, events with risk score + signals, `<AdminRecoveryRequests userId>` (D's stub), Revoke button per active credential. Global event feed with a type filter (search param), and a "Revoked credentials" list. Make `login_fail` with `reason=origin_mismatch` stand out (phishing demo shows it here).
- [ ] `POST /api/admin/credentials/:id/revoke` admin+reauth: `revokeCredential(id,"admin")`, `admin_action` event `{action:"revoke_credential", target}` + `credential_revoked` event, `notify` the owner.

### 4. Wrap-up
- [ ] Manual test on port 3300: dev sessions (`pnpm dev:session`, see `docs/foundation.md#dev-sessions`) for list/rename/revoke/admin pages; real passkeys only work after A merges, so test the link state machine with two browser profiles as far as possible and document what the master must re-test.
- [ ] Unit tests for any pure logic you extract (link state/expiry, event → icon mapping).
- [ ] Fill Handoff.

## Contracts you provide
- `EventList` and the admin pages: D's phishing demo expects attack 3 (`login_fail`, `metadata.reason = "origin_mismatch"`) to be visible in the admin event feed.
- `/link` and `/link/[id]` URLs (A links to `/link` from `/home`).

## Status
_Tick the task boxes above as you commit; short progress notes here._

## Decisions

## Handoff
