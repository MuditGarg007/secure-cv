# Data model

SQLite at `web/data/app.db`, Drizzle schema in `web/src/server/db/schema.ts` (implemented, frozen for agents), migration in `web/drizzle/`. Timestamps stored as integer ms. IDs are random UUID text. Every table has `created_at`.

## Tables

### users
| col | notes |
|---|---|
| id | pk |
| handle | unique, `^[a-z0-9_]{3,32}$` |
| display_name | |
| webauthn_user_id | 32 random bytes as base64url text. WebAuthn `user.id`, never the handle. |
| face_template_enc | base64 text, null if not enrolled. Opaque, from bio. Holds the face embedding AND the custom gesture template (one blob, enrolled together; see `docs/biometrics.md#bio-api`). |

Admin role is not stored: `ADMIN_HANDLES` env decides.

### credentials
| col | notes |
|---|---|
| id | pk |
| user_id | fk |
| credential_id | base64url text, unique |
| public_key | blob |
| sign_count | int |
| transports | JSON text |
| label | "Chrome on Android", "Security key" |
| last_used_at, last_used_ua | |
| revoked_at | null = active |
| revoked_reason | `user` / `lost` / `admin` / `recovery` / `clone_detected` |

### sessions
| col | notes |
|---|---|
| id | pk |
| token_hash | sha256 of the random cookie token |
| user_id, credential_id | credential_id = `credentials.id` row id |
| step_up_pending | bool. While true only `/api/stepup/*` and logout work. |
| reauth_at | last fresh passkey assertion |
| expires_at | absolute expiry |
| revoked_at | |

Revoking a credential revokes its sessions.

### challenges
One table for WebAuthn and liveness challenges. Delete on use; ignore if `expires_at` passed.

| col | notes |
|---|---|
| id | pk, also stored in an httpOnly `flow` cookie for WebAuthn |
| purpose | `register` / `login` / `reauth` / `add_key` / `link_approve` / `link_register` / `recovery_register` / `stepup_liveness` / `recovery_liveness` / `oauth_code` / `oauth_liveness` / `oauth_liveness_pass` (docs/oauth.md) |
| challenge | WebAuthn challenge, or JSON prompt list for liveness |
| user_id | nullable |
| target_id | linkId / recoveryId the approval is bound to |
| data | JSON, e.g. pending sign-up `{handle, displayName, webauthnUserId}` (user row is created only after the passkey verifies) |
| attempts_left | liveness only |
| expires_at | |

### recovery_codes
`id, user_id, code_hash (argon2id), used_at, superseded_at`. At most one active per user.

### recovery_requests
| col | notes |
|---|---|
| id | pk |
| user_id | |
| method | `code_liveness` / `code_only` |
| state | see `docs/flows.md#recovery` |
| cooldown_until | |
| binding_hash | sha256 of an httpOnly cookie set at start. Only that browser can finish. |
| cancelled_by | `user` / `admin` |
| updated_at | last state change (48 h idle expiry) |

### device_links
| col | notes |
|---|---|
| id | pk |
| short_code | 6 digits, shown on both screens |
| nonce | in the QR URL fragment |
| binding_hash | new device's cookie |
| requester_ua | shown to approver |
| status | `pending` / `approved` / `denied` / `consumed` |
| user_id | set on approve |
| expires_at | +5 min |

### auth_events (append-only, never update or delete)
| col | notes |
|---|---|
| id | autoincrement |
| user_id, credential_id | nullable |
| type | `register`, `login_success`, `login_fail`, `step_up_required`, `step_up_pass`, `step_up_fail`, `blocked`, `logout`, `reauth`, `bio_enrolled`, `bio_deleted`, `device_linked`, `credential_added`, `credential_revoked`, `recovery_code_generated`, `recovery_started`, `recovery_liveness_pass`, `recovery_liveness_fail`, `recovery_cancelled`, `recovery_completed`, `clone_detected`, `admin_action`, `app_authorized` |
| ip, ua, country | |
| risk_score, risk_signals | JSON |
| metadata | JSON, never secrets or images |

### notifications
`id, user_id, text, read_at`. Shown on `/home` ("New sign-in from Pune", "Recovery started for your account").
