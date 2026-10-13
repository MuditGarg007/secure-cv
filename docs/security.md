# Security model

Also the source for the "short threat model" deliverable in `ps.md`.

## Why passkeys first, biometrics second
1. **Origin binding.** A passkey assertion is tied to the real origin and rpID; a look-alike site can't get one. Webcam video has no origin binding: a phishing page can relay the real site's challenge and forward the victim's face.
2. **Camera injection.** Virtual cameras can feed recorded or deepfaked video. The server can't prove the camera is real.
3. **Faces aren't secret.** They're on social media.

So liveness only ever adds assurance on top of a passkey login (step-up) or alongside a recovery code plus a cooldown (recovery). It never creates a session alone.

## Invariants
- No passwords, no SMS/email OTP, no magic links.
- WebAuthn with user verification required; origin, rpID, challenge and signCount checked every time; challenges single-use with expiry.
- Biometric decisions made by bio from raw frames, never trusted from the browser. Client sees pass/fail + coarse hint only (no scores = no oracle for tuning a spoof).
- Raw frames never stored or logged. Face templates stored AES-256-GCM encrypted; key lives only in bio, so a web DB leak alone exposes no templates.
- Recovery code: 100 random bits, Crockford base32, stored as argon2id, single use, replaced after recovery.
- Recovery always has a cooldown, alerts all signed-in devices, can be cancelled, and can only be finished from the browser that started it.
- Sensitive actions need a fresh passkey assertion (within 5 min).
- Every auth action writes an `auth_events` row.

## Threat model

### Covered
| Threat | Mitigation |
|---|---|
| Phishing / look-alike site | WebAuthn origin + rpID binding, server origin check. Shown live in `docs/phishing-demo.md`. |
| Password reuse, stuffing, breach dumps | No passwords. Server holds only public keys. |
| SIM swap, OTP interception, OTP social engineering | No OTPs anywhere. |
| DB leak | Public keys, argon2id code hashes, encrypted templates. |
| Photo or replayed video at step-up | Random 3-gesture sequence per challenge, gesture bound to the matching face in the same frames, tight time window. |
| Spliced video (face from one clip, hand from another) | Continuity check on face embeddings + gesture/face co-presence. |
| Stolen unlocked device | Passkey needs device biometric/PIN. Revoke from another device or admin. |
| Lost device | Revoke flow kills its sessions. |
| Cloned authenticator | signCount regression → auto-revoke. |
| Session theft | HttpOnly cookie, hashed in DB, expiry, rotation, scopes. |
| Account takeover via recovery | Code + liveness + cooldown + alerts + cancel + browser binding. |
| Approval replay | Approval challenges bound to the specific link ID. |

### Partially covered
| Threat | Status |
|---|---|
| Real-time deepfake through a virtual camera | Random prompts and hand-near-face make it harder, not impossible. Still needs the passkey first. |
| Victim tricked into reading out their code and doing liveness | Cooldown + alerts let the real user cancel, if they still have a signed-in device. |
| User lost every device | Recovery still works, but no device receives the alert. Email alerts are a stretch goal. |
| Basic-phone users | Security key / NFC card, or a phone-as-key via hybrid QR. No IVR/USSD. |

### Not covered
- Malware controlling the user's device or browser.
- Coercion.
- Compromise of passkey sync providers (Apple/Google/etc.).
- Attacker with both the DB and `BIO_TEMPLATE_KEY`.
- Rate limiting / DoS (only per-challenge attempt limits).
- Production readiness of biometrics: InsightFace weights are non-commercial, no anti-spoof model in v1, no ISO/IEC 30107-3 liveness certification.

## PR checklist for auth changes
- [ ] Challenge single-use, purpose-checked, target-bound?
- [ ] Session scope + reauth enforced?
- [ ] zod on input?
- [ ] auth_events row written?
- [ ] No scores, codes, tokens or frames in responses or logs?

## Decisions (agent D)
- Recovery `complete` runs credential/session revocation, new-credential insert and recovery-code
  "used" marking in one DB transaction, gated on a conditional `ready → completed` state update, so a
  double-submit or a cancel racing a complete can't both win.
- Recovery liveness attempts are capped per *request* (counted from `recovery_liveness_fail`
  auth_events, not just per challenge), so fetching a fresh challenge can't reset the 3-fail limit.
- The new recovery code is returned once in the `complete/verify` response (the deliverable) but is
  never logged; events record only that a code was generated.
- Recovery binding cookie TTL = longest cooldown (72 h) + idle window (48 h), so the browser can
  always finish a request that is still legally open.
