# Sign in with Secure (sample apps)

Lets a separate app (the sample is `bank/`, "Mock Bank of Localhost") use Secure as its sign-in. It is a
minimal OAuth 2 authorization-code flow with PKCE. The app never runs WebAuthn and never sees a passkey,
a face frame or a biometric score. It only learns who the user is and how they proved it.

## Flow

```
 Bank (:4000)                     Browser                          Secure (:3000)
 /login ── 303 ──────────────────► /oauth/authorize?client_id&redirect_uri&state&code_challenge&acr_values
                                   (not signed in → /signin?next=… → passkey → [risky: step-up] → back)
                                   consent screen: passkey (fresh, 5 min) [+ face + gesture if acr=liveness]
                                   POST /api/oauth/approve → {redirect}
 /callback?code&state ◄────────── 303
 POST /api/oauth/token {code, code_verifier} ─────────────────────────────► {sub, handle, name, acr, amr, auth_time}
```

## acr_values

| Value | Secure requires | Bank uses it for |
|---|---|---|
| `passkey` (default) | signed-in session + passkey assertion within `REAUTH_WINDOW_MS` | signing on |
| `liveness` | the above, then a face + gesture liveness check (`/api/oauth/liveness/*`) | transfers over $1,000 |

`binding_message` (≤ 80 chars, e.g. "Send $2,500.00 to @bob") is shown on the consent screen so the user sees
what they are approving. The bank keeps the transfer itself server-side, keyed by `state`, and runs it only if
the code comes back for the same `sub` with `acr = liveness`.

## Rules (Secure side)

- Clients are registered in `OAUTH_CLIENTS` (`web/src/server/config.ts`). `redirect_uri` must match exactly;
  a bad client or redirect is shown on Secure's page and never redirected to.
- Public clients: PKCE `S256` is mandatory, no client secret.
- Codes are `challenges` rows (`purpose = oauth_code`, `targetId = client_id`), single-use, `OAUTH_CODE_TTL_MS`.
  A wrong `redirect_uri` or `code_verifier` burns the code.
- Liveness for an app never creates a session (AGENTS.md rule 2): it needs a full, freshly reauthed passkey
  session. A pass is stored as an `oauth_liveness_pass` challenge (`OAUTH_LIVENESS_PASS_TTL_MS`) and spent by
  exactly one approval.
- Every approval logs `app_authorized` (`metadata {client, acr}`); app liveness logs `step_up_pass` /
  `step_up_fail` with `metadata.context = "app_approval"`.
- The token response carries no biometric data, only `amr` (`["passkey"]` or `["passkey","face","gesture"]`).

## Decisions

- Plain JSON identity from the token endpoint instead of a signed ID token (JWT): the app calls it server to
  server, so a signature adds key management without adding trust for the demo.
- Codes and liveness passes reuse the `challenges` table (new purposes only): no schema migration.
- The step-up page now honours `?next=` so a risky sign-in started from an app still returns to the consent screen.
- The bank keeps sessions and pending requests in memory and data in `bank/data/bank.json`: zero setup.
