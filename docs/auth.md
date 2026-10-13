# Auth core: passkeys, sessions, risk

Code: `web/src/server/auth/`, `web/src/server/risk.ts`.

## WebAuthn

| Setting | Value |
|---|---|
| rpID / rpName / origin | `RP_ID`, `RP_NAME`, `ORIGIN` env |
| Challenge | 32 random bytes, single-use, TTL 300 s, in `challenges` table |
| Timeout | 60 s |

Registration options:
```ts
{
  rpID, rpName,
  userID: user.webauthn_user_id,   // random bytes, not the handle
  userName: user.handle,
  userDisplayName: user.display_name,
  attestationType: "none",
  authenticatorSelection: { residentKey: "required", userVerification: "required" },
  excludeCredentials: activeCreds,
}
```
No `authenticatorAttachment` restriction: platform passkeys, phone-as-key (hybrid QR) and USB/NFC security keys all work. That covers users without a modern laptop.

Login options: `{ rpID, userVerification: "required", allowCredentials: [] }` (discoverable). Use browser autofill (`autocomplete="username webauthn"`) plus a plain "Sign in with passkey" button. Reauth uses the same options with `allowCredentials` = the user's active credentials.

### Verify checklist (every ceremony)
1. Load the challenge by the `flow` cookie, check purpose and expiry, **delete it**.
2. `verify*Response` with expected challenge, origin, rpID, `requireUserVerification: true`. Origin failure → `ORIGIN_MISMATCH` + `login_fail` event with `metadata.reason = "origin_mismatch"` (the phishing demo relies on this).
3. Credential must exist and not be revoked.
4. signCount: if stored and new are both > 0 and new ≤ stored, revoke as `clone_detected` and return `BLOCKED`. Skip when both are 0 (synced passkeys).
5. Update `sign_count`, `last_used_*`. Set `sessions.reauth_at = now`.
6. Write an `auth_events` row.

Approval ceremonies (`link_approve`) store `target_id` on the challenge, so an approval signed for one link can't be replayed on another.

## Sessions
- Cookie `sid`: 32 random bytes, `HttpOnly; SameSite=Lax; Path=/` (`Secure` when on HTTPS). DB stores only the sha256.
- Absolute expiry 12 h. Rotate token on step-up pass.
- One kind of session. Recovery doesn't use a session: its routes are bound by the `rec_bind` cookie until completion issues a normal session.
- `step_up_pending = true` blocks everything except `/api/stepup/*` and logout.
- One helper `requireSession({ reauth, allowPending, admin })` used by every route (`web/src/server/auth/sessions.ts`, see `docs/foundation.md`).

**Reauth within 5 min required for**: revoking a credential, adding a security key, regenerating the recovery code, enrolling or deleting biometrics, admin writes. Approving a device link counts as reauth (it includes its own assertion).

Mutating routes check the `Origin` header equals `ORIGIN`. With SameSite=Lax that is enough CSRF protection.

## Risk check
Pure function, runs after a valid login assertion and before the session is issued:

```ts
risk({ country, ua, recentFailures, credential, history }) → { score, signals, decision }
```

| Signal | Condition | Weight |
|---|---|---|
| `new_country` | country not in user's past successful logins | 40 |
| `ua_change` | browser/OS differs from credential's `last_used_ua` | 20 |
| `recent_failures` | ≥ 3 failed logins for this user in 15 min | 20 |

First login after sign-up: score 0.

| Score | Decision |
|---|---|
| < 30 | `allow`: full session |
| 30–79 | `step_up`: session with `step_up_pending`, go to liveness. No biometrics enrolled → `block`. |
| ≥ 80 | `block`: no session, `blocked` event, notification to the user |

Country source: `x-vercel-ip-country` / `cf-ipcountry` header if deployed behind such a host, else unknown (signal skipped). Demo: when `DEBUG_RISK=1`, header `X-Debug-Country: XX` overrides it, set by a hidden "Simulate location" toggle on `/signin`.

Weights and thresholds live in `config.ts`.

## Decisions
- `new_country` needs a known current country AND at least one past country for the user (`login_success`, `step_up_pass`, `register` events). No history = nothing to compare, so the first login scores 0.
- `ua_change` compares `uaFamily()` of the request with the credential's `last_used_ua` before this login; skipped when there is none.
- `recent_failures` counts every `login_fail` row for the user in the window (login, reauth and approval failures alike).
- Step-up `reason` is the coarse category of the heaviest signal: `new_location` / `new_device` / `recent_failures`.
- On a blocked login the credential's `last_used_at/ua` are put back to their previous values (sign_count stays updated), so an attacker's browser never becomes the "known" one.
- Reauth challenges are bound to the session (`targetId = session.id`), so a reauth started in one session can't be finished in another.
- Sign-up inserts the user and credential in one synchronous SQLite transaction (`server/auth/signup.ts`); a handle race returns `HANDLE_TAKEN`.
- `?next=` accepts only same-site paths: starts with `/`, not `//`, no backslash, whitespace or control chars (`server/auth/safe-next.ts`).
- Demo "Simulate location" defaults to `IN` (home) and is sent on sign-up too, so sign-up and the first sign-in share a baseline country and choosing another country triggers `new_country`.
