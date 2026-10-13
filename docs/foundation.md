# Foundation API (already on `main`)

Shared code every agent builds on. Use these; don't re-implement them. Exported signatures are frozen (see `docs/agents/workflow.md`). All paths below are under `web/src/`.

## Route handler pattern

```ts
// app/api/devices/[id]/route.ts
import { z } from "zod";
import { route, parseJson, ok, ApiError } from "@/server/http";
import { requireSession } from "@/server/auth/sessions";
import { logEvent } from "@/server/events";

const Body = z.object({ label: z.string().trim().min(1).max(60) });

export const PATCH = route(async (req, ctx: RouteContext<"/api/devices/[id]">) => {
  const { id } = await ctx.params;
  const { user } = await requireSession();                 // or { reauth: true }, { admin: true, reauth: true }
  const body = await parseJson(req, Body);                 // ZodError → 400 VALIDATION
  // ... call a server/* function ...
  if (!found) throw new ApiError("NOT_FOUND");
  return ok({ ok: true });
});
```

`route()` checks `Origin === ORIGIN` on POST/PUT/PATCH/DELETE (CSRF) and turns `ApiError` / `ZodError` into `{ error: { code, message } }` with the right status. Unknown errors → 500 `INTERNAL` without details.

## Server modules

| Module | Exports |
|---|---|
| `server/env.ts` | `env` (validated), `adminHandles`, `isHttps` |
| `server/config.ts` | all tunables, one section per agent |
| `server/db/client.ts` | `db` (Drizzle, better-sqlite3, lazy, auto-migrates), `schema` |
| `server/db/schema.ts` | tables + types `User`, `Credential`, `Session`, `Challenge`, `RecoveryRequest`, `DeviceLink`, `AuthEvent`, enums `challengePurposes`, `recoveryStates`, `authEventTypes` |
| `server/http.ts` | `route`, `parseJson`, `ok`, `ApiError(code, message?)`, `ERROR_STATUS`, `errorResponse` |
| `server/request-meta.ts` | `requestMeta()` → `{ip, ua, country}`; honours `X-Debug-Country` when `DEBUG_RISK=1` |
| `server/events.ts` | `logEvent({type, userId?, credentialId?, riskScore?, riskSignals?, metadata?})` (insert-only) |
| `server/notifications.ts` | `notify(userId, text)`, `unreadNotifications(userId)`, `markNotificationsRead(userId, ids)` |
| `server/crypto.ts` | `randomToken(bytes?)`, `sha256(s)`, `randomDigits(n)` |
| `server/users.ts` | `HANDLE_RE`, `getUserById`, `getUserByHandle`, `isAdmin(user)`, `hasFace(user)` |
| `server/recovery-code.ts` | `generateRecoveryCode`, `normalizeRecoveryCode`, `issueRecoveryCode(userId)` → plaintext once, `checkRecoveryCode(userId \| null, code)` → code row id \| null (constant-ish time), `markRecoveryCodeUsed(id)` |

### `server/auth/sessions.ts`

| Function | Notes |
|---|---|
| `createSession({userId, credentialId, stepUpPending?})` | sets `sid` cookie; `reauth_at = now`. `credentialId` = `credentials.id` row id |
| `getCurrentSession()` | `{session, user}` or null; ignores step-up/reauth |
| `requireSession({reauth?, allowPending?, admin?})` | THE route guard. Throws `UNAUTHENTICATED` / `STEP_UP_REQUIRED` / `FORBIDDEN` / `REAUTH_REQUIRED` |
| `requirePageSession({admin?, next?})` | server-component guard; redirects to `/signin[?next=]`, `/signin/step-up`, or `/home` |
| `isReauthFresh(session)` | |
| `markReauth(sessionId)` | after reauth or a link approval |
| `completeStepUp(sessionId)` | clears pending, rotates token, marks reauth |
| `endCurrentSession(sessionId)` | revoke + clear cookie (logout, step-up out of attempts) |
| `revokeSession`, `revokeSessionsForCredential(credRowId)`, `revokeAllSessionsForUser(userId, exceptSessionId?)` | |

### `server/auth/webauthn.ts` (every passkey ceremony goes through these)

| Function | Notes |
|---|---|
| `newWebauthnUserId()` | random 32-byte base64url for a new user |
| `startRegistration({purpose, user:{webauthnUserId, handle, displayName}, userId?, excludeUserId?, targetId?, data?})` | → `options`; stores challenge, sets `flow` cookie. `data` is stored on the challenge (e.g. pending sign-up) |
| `finishRegistration({purpose, response, targetId?})` | → `{challenge, credential: NewCredential}`. Checks challenge (single-use, purpose, target), origin, rpID, UV, duplicate. Does NOT insert |
| `saveCredential({userId, credential, label})` | inserts, sets `last_used_*` |
| `startAuthentication({purpose, userId?, targetId?})` | `userId` → allowCredentials = that user's active creds; omit for discoverable login |
| `finishAuthentication({purpose, response, targetId?, expectedUserId?})` | → `{challenge, credential, user, previous}`. Full docs/auth.md checklist incl. signCount clone detection (revokes + `clone_detected` event + notify + throws `BLOCKED`). Logs `login_fail` (with `metadata.reason`, e.g. `origin_mismatch`) on any failure. Caller logs the success event and handles sessions. `previous.lastUsedUa` = UA before this login (risk check) |
| `registrationResponseSchema`, `authenticationResponseSchema` | zod for `{response}` bodies; cast to `RegistrationResponseJSON` / `AuthenticationResponseJSON` |

Purposes: registration `register | add_key | link_register | recovery_register`; authentication `login | reauth | link_approve`. Bind approvals/recovery with `targetId` (linkId / recoveryId).

### `server/auth/challenges.ts`
`createChallenge`, `peekChallenge(id, purpose, targetId?)`, `consumeChallenge(id, purpose, targetId?)`, `deleteChallenge`, `setFlowCookie`, `takeFlowCookie`, `setBindingCookie(name, ttlMs)` → sha256 to store, `readBindingHash(name)`, `clearCookie(name)`. Liveness challenges use the same table (B).

### `server/auth/credentials.ts`
`activeCredentials(userId)`, `getCredential(rowId)`, `getCredentialByWebauthnId(id)`, `revokeCredential(rowId, reason)` (also revokes its sessions; caller logs `credential_revoked`).

## Client modules

| Module | Exports |
|---|---|
| `lib/api.ts` | `api<T>(path, {method?, json?, form?, headers?})`, throws `ApiClientError {code, message, status}` |
| `lib/webauthn-client.ts` | `registerPasskey({optionsPath, verifyPath, optionsBody?, verifyBody?, headers?})`, `authenticatePasskey({..., autofill?})`, `reauth()`, `withReauth(fn)` (retries once after a passkey check on `REAUTH_REQUIRED`), `errorMessage(e)`. User cancel → `ApiClientError("CANCELLED")` |
| `lib/voice.ts` | `speak(text, lang?)`, `stopSpeaking()` |
| `lib/ua.ts` | `labelFromUA(ua)` ("Chrome on Android"), `uaFamily(ua)` (risk `ua_change`) |
| `components/common/PageShell.tsx` | `<PageShell title voiceText? wide?>`, `BIG` button class |
| `components/common/VoiceButton.tsx` | `<VoiceButton text />` |
| `components/ui/*` | shadcn (Base UI): alert, alert-dialog, badge, button, card, checkbox, dialog, dropdown-menu, input, label, progress, select, separator, skeleton, sonner (`toast` from `sonner`), table, tabs, textarea, tooltip. Link buttons: `<Button nativeButton={false} render={<Link href="/x" />}>` (without `nativeButton={false}` Base UI logs an error) |

The root layout renders `AppHeader` (nav + sign out) and the toaster. Sign-out calls `POST /api/auth/logout` (agent A).

## Contract stubs
Listed in `docs/agents/workflow.md#3-contracts-between-agents`. Read the header comment of each stub for its exact behaviour.

## Commands (in `web/`)
`pnpm dev -p <port>`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm db:reset`. The DB file and tables are created on first request.

## Dev sessions
Until agent A's sign-in is merged, other agents get a signed-in browser with the dev CLI (direct DB write, not an HTTP route, so it adds no login path):

```
pnpm dev:session <handle> [--pending] [--stale] [--face] [--cred] [--code]
# prints: document.cookie = "sid=...; path=/"   → paste into the browser console on your port
```
`--pending` step-up pending session, `--stale` reauth 10 min old (to see `REAUTH_REQUIRED`), `--face` fake face template (`BIO_FAKE` only), `--cred` dummy credential row (it can't sign, so passkey ceremonies with it fail), `--code` issues a recovery code and prints it. Admin = a handle listed in `ADMIN_HANDLES` (`admin`). Dev only; never part of the demo.
