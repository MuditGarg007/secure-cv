# Mock Bank of Localhost

A separate sample app that uses **Secure** for sign-in. It has no passwords and no WebAuthn code of its own:
it sends the user to Secure and gets back who they are and how they proved it (`docs/oauth.md`).
The look is deliberately 2010s online banking.

- **Sign On**: redirect to Secure, approve with a passkey, land on Account Summary. First sign-on opens a
  checking and a savings account with demo money.
- **Transfers up to $1,000**: done straight away (the passkey sign-on covers it).
- **Transfers over $1,000**: sent to Secure for approval with a fresh passkey **and** a face + hand-gesture
  check. Secure shows "Send $X to @user", and the bank runs the transfer only if Secure confirms the same user
  with `acr = liveness`.
- **Security Center**: how you signed on, plus links to manage passkeys and the face check in Secure.

## Run

```
./dev.sh                 # from the repo root: starts bio, web, landing and the bank
# or alone (Secure must be running on :3000):
cd bank && node server.mjs
```

Open http://localhost:4000. Node 22 or newer, no `npm install` needed.

| Env | Default |
|---|---|
| `PORT` | `4000` |
| `BANK_URL` | `http://localhost:$PORT` (must match the redirect URI registered in `OAUTH_CLIENTS`) |
| `SECURE_URL` | `http://localhost:3000` |

Demo tips: sign on with two Secure accounts (two browser profiles) so you can send money between them by
username. Big transfers need the face check set up under Secure → Security. Data lives in `bank/data/bank.json`
(gitignored); delete it to reset. Sessions are in memory, so restarting the bank signs everyone off.
