# Phishing-resistance demo

The `ps.md` deliverable: show that a phishing page can't capture a usable passkey credential.
Full writeup and threat context in [`docs/phishing-demo.md`](../docs/phishing-demo.md).

A look-alike sign-in page runs on a **different origin** from the real app and tries, five
different ways, to get a credential it can reuse. Every attack fails; the contrast form (5)
shows what a password + OTP site would have leaked.

## Why `127.0.0.1`, not a `*.localhost` subdomain

The clone runs on `http://127.0.0.1:<port>` while the real app is `http://localhost:<port>`.
These are different origins, and `127.0.0.1` is **not** a DNS suffix of `localhost`, so it can
never be a valid rpID for a `localhost` passkey. A `foo.localhost` clone would blur that point.

## Run it

Two terminals. Start the real app first, then the clone pointed at it.

```bash
# 1) real app  (defaults match the final demo)
cd web && pnpm dev -p 3000           # ORIGIN=http://localhost:3000, RP_ID=localhost

# 2) clone  (REAL_ORIGIN + PHISH_PORT have demo defaults; override per worktree)
cd phish && pnpm install
REAL_ORIGIN=http://localhost:3000 PHISH_PORT=3001 pnpm start
# open http://127.0.0.1:3001
```

Against agent D's worktree instead: real app on `3400`, clone with
`REAL_ORIGIN=http://localhost:3400 PHISH_PORT=3401 pnpm start`.

Click the attacker-console buttons top to bottom and watch the log panel.

## What each attack should print

| # | Button | Expected |
|---|---|---|
| 1 | Ask for the real site's passkey (`rpId: "localhost"`) | Browser throws `SecurityError` / `NotAllowedError`. Nothing released. |
| 2 | Ask for a passkey for the clone's own rpId | No passkey exists for it (bare IP: `SecurityError`). Nothing usable. |
| 3 | Relay with a forged origin | `ORIGIN_MISMATCH`, HTTP 400. A `login_fail` event with `reason=origin_mismatch` appears in `/admin`. |
| 4 | Relay the face check (`/api/stepup/challenge`) | `401 UNAUTHENTICATED`. Liveness only exists after a real passkey login. |
| 5 | Contrast password + OTP form | The typed password and OTP are shown in plain text — what a legacy site leaks. |

Attacks 1, 2 and 5 run fully against any build. Attacks 3 and 4 call the real app's
`/api/auth/*` and `/api/stepup/*` routes (agents A and B), so they are **fully green only on a
merged build**; before merge they return `404` from the proxy, which the panel shows as-is.

## Attack 3 in detail (`attack3.mjs`)

The strongest version of the relay. The script, run by the "3" button or standalone:

```bash
cd phish && REAL_ORIGIN=http://localhost:3000 PHISH_PORT=3001 pnpm attack3
# exit code 0 = rejected as expected
```

1. A victim registers a passkey on the **real** site, driven by Playwright with a Chrome DevTools
   Protocol **virtual authenticator**.
2. The attacker exports the passkey's **private key** with `WebAuthn.getCredentials` — the worst
   case, as if the authenticator itself were compromised.
3. The phishing server fetches a fresh challenge from `/api/auth/login/options`, forges an
   assertion whose `clientDataJSON.origin` is the **clone's** origin (`forge.mjs`, Node crypto),
   and POSTs it to the real `/api/auth/login/verify` with a **forged `Origin: <real origin>`
   header** so the CSRF/origin check passes.
4. The signature is cryptographically valid for the stolen key — yet the server rejects it,
   because the **signed origin inside `clientDataJSON`** is the clone, not the real origin:
   `ORIGIN_MISMATCH`, and `login_fail reason=origin_mismatch` in the event log.

A control attempt (step 4 of the script, `--no-control` to skip) signs the *same* stolen key over
the *real* origin and is accepted — proving only the origin, nothing else, stopped the attack. A
phishing page cannot produce that assertion, because the browser writes the real origin into
`clientDataJSON` only when the user is actually on the real origin.

## Files

- `server.mjs` — static clone page + `/api/*` proxy (rewrites `Origin`) + `/attack/3`, `/attack/5` endpoints.
- `index.html` — the look-alike `/signin`, attacker console, log panel.
- `attack3.mjs` — the forged-origin relay (Playwright + CDP virtual authenticator).
- `forge.mjs` — hand-builds a WebAuthn assertion from a raw private key.
