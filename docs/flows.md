# User flows

Every screen: one primary action, big buttons with icon + text, and a 🔊 button that reads the main text aloud (`speechSynthesis`). Works at 360 px width. No typing needed to sign in.

## Pages
```
/                 landing: Sign in, Create account
/signup           wizard
/signin           passkey sign-in, "Use phone or security key", "Lost my device"
/signin/step-up   liveness check
/link             new device: QR + short code, polls
/link/[id]        existing device: approve screen (opened by scanning the QR)
/recover          recovery start
/recover/[id]     recovery progress
/home             notifications, last sign-in, quick links          (session)
/devices          list, rename, remove, add key, add device         (session)
/activity         login history                                     (session)
/security         biometrics, recovery code                         (session)
/admin            users, devices, events, revoked credentials       (admin)
```

## 1. Sign-up
1. Handle + display name → `register/options`.
2. "Your device will ask for your fingerprint, face or screen lock" → `startRegistration` → `register/verify`. Label auto-derived from UA.
3. Face enrollment (skippable): consent checkbox, camera with face oval, capture 5 frames → `/bio/enroll`. Skip warning: "Without this, unusual sign-ins get blocked and recovery takes 3 days."
4. Recovery code from `/me/recovery-code`, shown as `XXXX-XXXX-XXXX-XXXX-XXXX` + Copy/Print. "I saved it" checkbox required.
5. → `/home`.

## 2. Sign-in
`login/options` → OS prompt → `login/verify` → risk decision:
- `allow` → `/home`
- `step_up` → `/signin/step-up`
- `block` → "We stopped this sign-in. Check your other devices."

## 3. Step-up (liveness)
1. "This sign-in looks unusual (new location). Quick check." Show the reason category only.
2. `/stepup/challenge` → 3 gesture prompts.
3. Camera screen: one prompt card at a time (emoji + name + voice), "hold it next to your face", countdown bar.
4. Auto-submit at end of window → `/stepup/verify`.
5. Pass → `/home`, notification "New sign-in from <country>" for the user. Fail → hint + retry. 0 attempts left → sign out.

## 4. Add device (QR)
```
New device (/link)                   Existing device (signed in)
POST /link/start
show QR + 6-digit code, poll status
                                     phone camera scans QR → /link/[id]#nonce
                                     GET /link/:id?n= → show code + browser
                                     "Same code on the other screen?" [Approve] [Deny]
                                     approve/options → OS prompt → approve/verify
status = approved
register/options → OS prompt → register/verify → /home
```
Expires after 5 min. States: `pending → approved → consumed`, or `denied` / expired.

Also on `/signin`: "Use phone or security key", which is the browser's built-in hybrid/USB/NFC flow. No app code needed.

## 5. Remove device
`/devices` → Remove → "I lost it" / "I don't use it" → reauth if stale → `/devices/:id/revoke`. Row moves to "Removed devices" with reason. Removing the current device signs it out.

Security key: `/devices` → "Add card or key" → reauth → normal registration, label "Security key".

## 6. Recovery
1. `/recover`: handle + recovery code → `/recovery/start`.
2. If face enrolled: liveness (same capture UI as step-up). 3 failures → cancelled.
3. Cooldown screen with countdown: "We alerted your signed-in devices. Come back on this browser after <time>." Notification + banner with Cancel button appears on every active session of that user.
4. After cooldown: "Create new passkey" → `complete/options` → OS prompt → `complete/verify`. All old credentials and sessions revoked.
5. Show the new recovery code (must confirm saved) → `/home`.

Cooldowns: `code_liveness` 24 h, `code_only` 72 h. `RECOVERY_COOLDOWN_OVERRIDE_S` shortens both for the demo.

### Recovery state machine
```
start (face enrolled)   → pending_liveness
start (no face)         → cooling_down
pending_liveness  ─pass─────────► cooling_down
pending_liveness  ─3 fails──────► cancelled
cooling_down      ─time passes──► ready        (checked lazily on read)
ready             ─new passkey──► completed
any open state    ─cancel───────► cancelled    (user session or admin)
any open state    ─48 h idle────► expired
```
One pure function `transition(request, event, now, cfg)` in `server/recovery/machine.ts`, unit tested per edge. One open request per user.

## 7. Account pages
- `/home`: unread notifications, last sign-in time + country, open recovery banner with Cancel.
- `/activity`: event list with icons ✓ allowed, ⚠ step-up, ⛔ blocked.
- `/security`: enroll / re-enroll / delete face, regenerate recovery code.

## 8. Admin
Server-rendered, read straight from DB:
- Users list → user detail: devices (active + removed, with reason), events with risk signals, recovery requests with Cancel.
- Global event feed (filter by type), revoked credentials list.
- Writes (revoke credential, cancel recovery) need reauth and write an `admin_action` event.
