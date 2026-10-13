# HTTP API (web)

Routes under `/api`, JSON unless marked multipart. Zod schemas next to the route handler. WebAuthn objects are the `@simplewebauthn` JSON types. Pages read data with server components, so only client-driven calls and mutations need routes.

**Auth column**: `none` · `session` (any valid session, not step-up pending) · `full` · `full+reauth` (reauth within 5 min) · `admin+reauth` · `cookie:X` (binding cookie from earlier in the flow).

## Auth
| Method | Path | Auth | Body → Response |
|---|---|---|---|
| POST | `/auth/register/options` | none | `{handle, displayName}` → `{options}` + `flow` cookie. 409 `HANDLE_TAKEN` |
| POST | `/auth/register/verify` | cookie:flow | `{response}` → `{ok}` + `sid` (full). Creates user + credential. |
| POST | `/auth/login/options` | none | → `{options}` + `flow` |
| POST | `/auth/login/verify` | cookie:flow | `{response}` → `{status:"ok"}` / `{status:"step_up", reason}` (session issued, pending; `reason` = coarse category like `new_location`) / 403 `BLOCKED` |
| POST | `/auth/reauth/options` | session | → `{options}` |
| POST | `/auth/reauth/verify` | session | `{response}` → `{ok}`, sets `reauth_at` |
| POST | `/auth/logout` | session | → `{ok}` |

## Biometrics + step-up
| Method | Path | Auth | Body → Response |
|---|---|---|---|
| GET | `/bio/status` | none | → `{available, fake}` (capture UI shows the dev picker only when `fake`) |
| POST | `/bio/enroll` | full+reauth | multipart `meta={consent:true}` + `frame_000`..`frame_004` → `{ok}` / `{ok:false, hint}`; `hint` = `no_face \| multiple_faces \| low_quality` |
| DELETE | `/bio` | full+reauth | → `{ok}` |
| POST | `/stepup/challenge` | session (pending ok) | → `{challengeId, prompts, expiresAt, captureWindowMs}`. 409 `BIO_NOT_ENROLLED` |
| POST | `/stepup/verify` | session (pending ok) | multipart `meta={challengeId, timestamps}` + `frame_000`... → `{passed, hint?, attemptsLeft}`. Pass clears pending and rotates token. |

Frames are JPEG, ≤ 300 KB each (`MAX_FRAME_BYTES`). `meta.fake` (`pass` / `fail:<reason>`) is dev-only and is forwarded to bio only while bio reports `fake: true`.

## Devices
| Method | Path | Auth | Body → Response |
|---|---|---|---|
| PATCH | `/devices/:id` | full | `{label}` → `{ok}` |
| POST | `/devices/:id/revoke` | full+reauth | `{reason:"lost"\|"user"}` → `{ok}`. 409 `LAST_CREDENTIAL` if only one left. |
| POST | `/devices/key/options` | full+reauth | → `{options}` (register a security key / another passkey) |
| POST | `/devices/key/verify` | full+reauth | `{response, label}` → `{ok}` |
| POST | `/link/start` | none | → `{linkId, shortCode, qrUrl, expiresAt}` + `link_bind` cookie. `qrUrl = ORIGIN/link/<id>#<nonce>` |
| GET | `/link/:id/status` | cookie:link_bind | → `{status}` (new device polls every 2 s) |
| GET | `/link/:id?n=nonce` | full | → `{shortCode, ua, createdAt}` for approver. 404 on bad nonce. |
| POST | `/link/:id/approve/options` | full | `{nonce}` → `{options}` |
| POST | `/link/:id/approve/verify` | full | `{response, decision:"approve"\|"deny"}` → `{ok}` |
| POST | `/link/:id/register/options` | cookie:link_bind | → `{options}`, only when approved (403 `FORBIDDEN` before) |
| POST | `/link/:id/register/verify` | cookie:link_bind | `{response}` → `{ok}` + `sid` (full). 403 `FORBIDDEN` before approval |

## Account
| Method | Path | Auth | Body → Response |
|---|---|---|---|
| POST | `/me/recovery-code` | full+reauth | → `{code}` shown once, supersedes old |
| POST | `/me/notifications/read` | session | `{ids}` → `{ok}` |

## Recovery
| Method | Path | Auth | Body → Response |
|---|---|---|---|
| POST | `/recovery/start` | none | `{handle, code}` → `{recoveryId, next:"liveness"\|"cooldown"}` + `rec_bind` cookie. Bad handle or code → generic 400 `RECOVERY_INVALID`. |
| POST | `/recovery/:id/liveness/challenge` | cookie:rec_bind | → same as step-up challenge |
| POST | `/recovery/:id/liveness/verify` | cookie:rec_bind | multipart → `{passed, hint?, attemptsLeft}` |
| GET | `/recovery/:id` | cookie:rec_bind | → `{state, cooldownUntil?}` |
| POST | `/recovery/:id/cancel` | full (owner) or admin+reauth | → `{ok}` |
| POST | `/recovery/:id/complete/options` | cookie:rec_bind | → `{options}`, only in `ready` |
| POST | `/recovery/:id/complete/verify` | cookie:rec_bind | `{response}` → `{ok, newRecoveryCode}` + `sid`. Revokes all old credentials + sessions. |

## Admin writes
| Method | Path | Auth |
|---|---|---|
| POST | `/admin/credentials/:id/revoke` | admin+reauth |
| POST | `/admin/recovery/:id/cancel` | admin+reauth |

## Error codes
| Code | HTTP |
|---|---|
| `VALIDATION` | 400 |
| `UNAUTHENTICATED` | 401 |
| `STEP_UP_REQUIRED` | 403 |
| `REAUTH_REQUIRED` | 403 |
| `FORBIDDEN` | 403 |
| `BLOCKED` | 403 |
| `CREDENTIAL_REVOKED` | 401 |
| `ORIGIN_MISMATCH` | 400 |
| `CHALLENGE_EXPIRED` | 400 |
| `WEBAUTHN_FAILED` | 400 |
| `HANDLE_TAKEN` | 409 |
| `BIO_NOT_ENROLLED` | 409 |
| `LAST_CREDENTIAL` | 409 |
| `RECOVERY_INVALID` | 400 |
| `RECOVERY_STATE` | 409 |
| `NOT_FOUND` | 404 |
| `LINK_EXPIRED` | 410 |
| `BIO_UNAVAILABLE` | 503 |
| `INTERNAL` | 500 |

Implemented in `web/src/server/http.ts`. Mutating requests must carry `Origin: <ORIGIN>` (checked by `route()`); otherwise 403 `FORBIDDEN`.
