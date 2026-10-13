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
- [x] Attacks 1–4 fail with the errors above.
- [x] Attack 3 shows up in the admin event feed.
- [ ] A screen recording of the run exists for the pitch.

## Implementation (built)

Lives in `phish/` (own `package.json`, plain Node ESM + Playwright as a dev dep). See
`phish/README.md` for the full run guide; summary:

- `server.mjs` — serves the look-alike `/signin` on `127.0.0.1:<PHISH_PORT>` and proxies `/api/*`
  to `REAL_ORIGIN`, rewriting the `Origin` header to the real origin (a server can; a browser
  can't). Also exposes `POST /attack/3` (runs the script) and `/attack/5` (captures the fake form).
- `index.html` — the clone page: a passkey sign-in button plus an "attacker console" with one
  button per attack and a live log panel.
- `attack3.mjs` + `forge.mjs` — the forged-origin relay (details below).
- Ports/origins from env with demo defaults (`REAL_ORIGIN=http://localhost:3000`, `PHISH_PORT=3001`);
  tested against agent D's worktree with `REAL_ORIGIN=http://localhost:3400 PHISH_PORT=3401`.

### Attack 3, concretely
`attack3.mjs` drives Chromium with a CDP **virtual authenticator**: it registers a passkey on the
real origin, then exports its **private key** via `WebAuthn.getCredentials` (worst case — as if the
authenticator itself leaked). `forge.mjs` hand-builds an assertion with Node's `crypto`: a valid
ES256 (ECDSA P-256) or Ed25519 signature, whichever key the authenticator made, over `authenticatorData || sha256(clientDataJSON)`, where `clientDataJSON.origin`
is the **clone's** origin. It is POSTed to the real `/api/auth/login/verify` with a forged
`Origin: <real origin>` header (so the CSRF/origin header check passes). The server still rejects it
with `ORIGIN_MISMATCH` + `login_fail reason=origin_mismatch`, because the **signed** origin inside
`clientDataJSON` is the clone. A control run signs the same key over the real origin and is accepted,
proving the origin — and nothing else — stopped the attack. The script exits 0 when rejected as
expected. Login routes come from agent A, so attack 3 goes fully green on a merged build; the master
runs `cd phish && REAL_ORIGIN=http://localhost:3000 PHISH_PORT=3001 pnpm attack3`.

## Decisions
- Clone on `127.0.0.1` (bare IP), not a `*.localhost` subdomain, so it can't be a valid rpID suffix.
- Attacks 1/2/5 need no real backend; 3/4 call agents A/B routes and are verified at merge. Before
  merge the proxy returns 404 for those routes and the panel shows it as-is.
- Attack 3 exports the private key (strongest attacker) rather than just relaying a live ceremony, so
  the demo proves origin binding holds even against a fully compromised authenticator.
