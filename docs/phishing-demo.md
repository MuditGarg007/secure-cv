# Phishing-resistance demo

Deliverable from `ps.md`: show that a phishing page can't capture a usable credential.

## Setup
| | Origin | Notes |
|---|---|---|
| Real app | `http://localhost:3000` | `RP_ID=localhost` |
| Clone | `http://127.0.0.1:3001` | `phish/server.mjs`: serves a copy of `/signin` and proxies API calls |

Don't use a `*.localhost` subdomain for the clone; `localhost` would be a valid rpID suffix and blur the point.

Ports come from env (`REAL_ORIGIN`, `PHISH_PORT`) so the same code runs against an agent's worktree (e.g. real `:3400`, clone `:3401`) and the final demo (`:3000` / `:3001`).

The app's CSRF guard rejects mutating requests whose `Origin` header isn't `ORIGIN`. A browser can't fake that header, but the attacker's server can, so attack 3 sets `Origin` to the real origin on purpose: the point of the demo is that the **signed** origin inside `clientDataJSON` still gives it away.

The clone page has one button per attack and a log panel showing what happened.

## Attacks
1. **Ask for the real site's passkey.** Clone calls `navigator.credentials.get({ publicKey: { rpId: "localhost", ... } })`.
   Expected: browser throws `SecurityError`. Nothing released.
2. **Use the clone's own rpId.** Expected: browser has no passkey for it. Nothing usable.
3. **Relay with a forged origin.** Clone server fetches a real challenge from `/api/auth/login/options`, and a script (Playwright with a CDP virtual authenticator) produces an assertion whose `clientDataJSON.origin` is the clone, then posts it to the real `/api/auth/login/verify`.
   Expected: `ORIGIN_MISMATCH`, and a `login_fail` event with `reason = origin_mismatch` visible in `/admin`.
4. **Relay the face check.** Clone calls `/api/stepup/challenge` without a session.
   Expected: `401 UNAUTHENTICATED`. Liveness only exists after a real passkey login.
5. **Contrast (optional).** A fake password + OTP form on the clone that shows the captured values in plain text.

## Done when
- [ ] Attacks 1–4 fail with the errors above.
- [ ] Attack 3 shows up in the admin event feed.
- [ ] A screen recording of the run exists for the pitch.
