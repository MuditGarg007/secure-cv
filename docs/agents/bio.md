# Agent B: bio (face + gesture liveness, the USP)

Worktree `~/secure-bio`, branch `agent/bio`, web port **3200** (`ORIGIN=http://localhost:3200`), bio service port **8200** (`BIO_URL=http://localhost:8200`). Follow `docs/agents/workflow.md` strictly. Your scope check: `scripts/check-scope.sh bio`.

Bio env: create `bio/.env` (never committed) with `BIO_INTERNAL_TOKEN` copied from `web/.env.local` (already set for you), a fresh `BIO_TEMPLATE_KEY` (`python -c "import os,base64;print(base64.b64encode(os.urandom(32)).decode())"`) and `BIO_FAKE=1` while building. Run it with `uv run fastapi dev app/main.py --port 8200`.

**Read**: `ps.md`, `docs/foundation.md`, `docs/biometrics.md` (your spec), `docs/security.md`, `docs/api.md` (Biometrics + step-up), `docs/flows.md` (§1 step 3, §3), `docs/auth.md#sessions`.

## Mission
The whole biometric stack: the Python `bio/` service, the web-side client and challenge logic, the camera capture UI, enrollment, and step-up. D's recovery and A's sign-up/security pages consume your contracts, so **deliver a working fake-mode pipeline end to end first, then the real models.**

## You own
`bio/**` (incl. `pyproject.toml`, `uv.lock`, `.env.example`, `scripts/`, `tests/`), `web/src/app/api/bio/**`, `web/src/app/api/stepup/**`, `web/src/app/signin/step-up/**`, `web/src/server/bio/**`, `web/src/components/bio/**`, `web/src/lib/camera.ts` (+ `camera.test.ts`), the `bio` section of `web/src/server/config.ts`, `docs/biometrics.md`, this file.

## Contracts you must fulfil (frozen signatures, already stubbed on `main`)
- `web/src/server/bio/liveness.ts`: `parseLivenessSubmission`, `createLivenessChallenge`, `verifyLiveness`, `toClientResult` + types. D calls these for recovery with `purpose:"recovery_liveness", targetId: recoveryId`. Read the doc comments: `verifyLiveness` checks challenge ownership (userId/purpose/targetId), decrements `attempts_left`, deletes the challenge on pass or 0 attempts, and does NOT log events or touch sessions; callers do.
- `web/src/components/bio/LivenessCheck.tsx` `{challengeUrl, verifyUrl, onPassed, onFailedFinal}`: complete self-contained UI (fetch challenge, open camera, prompt cards with emoji + text + `speak()`, countdown bar, capture, upload, show hint + retry, call `onFailedFinal` at 0 attempts). D uses it on `/recover/[id]` unchanged.
- `web/src/components/bio/FaceEnrollPanel.tsx` `{onDone(enrolled), allowSkip?}`: consent checkbox BEFORE the camera opens, face oval, capture 5 frames, `POST /api/bio/enroll` (wrap with `withReauth`), retry on `{ok:false, hint}`, skip warning from `docs/flows.md §1`. A uses it in sign-up step 3.
- `web/src/components/bio/FaceSettings.tsx` `{enrolled}`: enroll / re-enroll (opens `FaceEnrollPanel`) / delete (`DELETE /api/bio` via `withReauth`, confirm dialog, explains consequences). A puts it on `/security`. Refresh with `router.refresh()` after changes.

## Tasks

### Phase 1: fake mode end to end (do first)
- [x] `bio/`: uv project pinned to **Python 3.12** (mediapipe has no 3.14 wheels; `uv python install 3.12` if needed). FastAPI app `bio/app/main.py`, `config.py` (pydantic-settings + all thresholds from `docs/biometrics.md`), `X-Internal-Token` check on every route (protecting `/healthz` too is fine; record your choice), `GET /healthz`, `POST /enroll`, `POST /verify` per `docs/biometrics.md#bio-api`. `bio/.env.example`.
- [x] `bio/app/crypto.py`: AES-256-GCM template blob `nonce(12)|ct|tag`, AAD = userId. pytest: round trip, wrong user fails, tamper fails.
- [x] `BIO_FAKE=1`: no models loaded, decision from `meta.fake` (`"pass"` / `"fail:<reason>"`); enroll returns a real encrypted dummy template so the crypto path is exercised.
- [x] `web/src/server/bio/client.ts`: calls bio with `X-Internal-Token`, timeout `BIO_TIMEOUT_MS`, any network error → `ApiError("BIO_UNAVAILABLE")`. Never log frames or scores.
- [x] `web/src/server/bio/challenge.ts`: pure prompt generator (`PROMPT_COUNT`, no two consecutive alike, crypto randomness) + `challenge.test.ts`.
- [x] Implement `liveness.ts` for real (multipart parsing with zod for `meta`, frame count ≤ `MAX_LIVENESS_FRAMES`, timestamps monotonic, attempts handling).
- [x] Routes: `POST /api/bio/enroll` (full+reauth, `meta.consent === true` required, exactly `ENROLL_FRAME_COUNT` frames, stores `templateEnc` in `users.face_template_enc`, `bio_enrolled` event), `DELETE /api/bio` (full+reauth, null the column, `bio_deleted` event).
- [x] `POST /api/stepup/challenge` + `POST /api/stepup/verify`: `requireSession({allowPending:true})`, only valid while `session.stepUpPending` (else `FORBIDDEN`). Pass → `completeStepUp`, `step_up_pass` event (bio detail in metadata), `notify(user, "New sign-in from <country>")`. Fail → `step_up_fail` event; 0 attempts → `endCurrentSession`. Response = `toClientResult(...)` only (no scores, rule 9).
- [x] `web/src/lib/camera.ts`: `getUserMedia` 640×480 user-facing, 10 fps JPEG q0.7 with `performance.now()` timestamps relative to the first frame, max frames, stop tracks on unmount.
- [x] Fake-mode dev switch: decide how the tester picks pass/fail in fake mode (e.g. web forwards `fake` only when bio reports fake mode), record under Decisions. It must be impossible for a browser to influence a real-mode decision.
- [x] `/signin/step-up` page: reason text from `docs/flows.md §3`, `<LivenessCheck challengeUrl="/api/stepup/challenge" verifyUrl="/api/stepup/verify">`, pass → `/home`, final fail → signed out → `/signin` with a message.
- [x] Real `LivenessCheck`, `FaceEnrollPanel`, `FaceSettings`.

### Phase 2: real models
- [x] `bio/scripts/download_models.py`: InsightFace `buffalo_l` (SCRFD + ArcFace ONNX) and MediaPipe `gesture_recognizer.task` into `bio/models/` (gitignored). If the `insightface` pip package won't build, run the two ONNX models directly with onnxruntime + numpy (record the decision).
- [x] `bio/app/pipeline.py`: decode JPEG in memory, face detect + embed, gesture recognition, then the decision table in `docs/biometrics.md#verify-decision-bio`. Keep the decision a pure function over per-frame results.
- [x] pytest for the decision function with synthetic per-frame results: each reason code, prompt order, hold time, face/gesture co-presence, timing, pass case.
- [ ] (needs a person, see Handoff) Manual check with a real webcam on port 3200: enroll, step-up pass live, fail with a phone photo/video, wrong gesture order.
- [ ] (needs people, see Handoff) Calibrate thresholds with a few people, write results under `docs/biometrics.md#decisions`.

### Stretch (only after everything above)
In-browser MediaPipe prompt ticking (UX only), MiniFASNet anti-spoof.

## How to test before A's login is merged
Your branch has no `/api/auth/*`, so no real passkey sessions. Never add a login backdoor to the app. Use the dev CLI (`docs/foundation.md#dev-sessions`): `pnpm dev:session tester --pending --face` gives a step-up-pending session for `/signin/step-up` (`--face` writes a placeholder template that can't be decrypted: in fake mode, skip decryption when the blob is `DEV-FAKE-TEMPLATE`, or enroll through your UI first to get a real one); `pnpm dev:session tester` gives a fresh full session for enrollment (reauth is fresh for 5 min). The `withReauth` retry path needs A's routes and is verified by the master after merge.

## Status
_Tick the task boxes above as you commit; short progress notes here._

- Phase 1 complete: fake mode end to end (API via curl, UI in Chrome with a synthetic camera).
- Phase 2 complete except the two human items: real models verified on synthetic composites (public-domain portrait + MediaPipe sample hands): live-like sequence passes; wrong order, static photo, other person and spliced face all fail. No live webcam session yet.
- Stretch not started.

## Decisions

- `/healthz` also requires `X-Internal-Token` (no reason for anything but web to call bio; bio exposes no docs/openapi either).
- Fake-mode switch: browser may send `meta.fake` (`pass` / `fail:<reason>`); web forwards it to bio only while bio's `/healthz` says `fake: true` (cached 10 s), and bio never reads it in real mode. The capture UI learns fake mode from `GET /api/bio/status` and only then shows a dev picker and the synthetic-camera fallback.
- Fake mode accepts the `DEV-FAKE-TEMPLATE` placeholder from `pnpm dev:session --face`; real mode treats it as `template_invalid`.
- Step-up challenges use `targetId = session.id`: attempts are counted per risky login, and a fresh passkey login is the only way to get new attempts.
- Every retry fetches a new challenge (fresh prompts); `createLivenessChallenge` replaces older challenges for the same user/purpose/target and inherits their remaining attempts, so new prompts never reset the limit.
- `verifyLiveness` takes the attempt atomically before calling bio (parallel uploads can't exceed the limit) and gives it back if bio is unavailable (our outage, not the user's failure).
- Identity failures (`face_mismatch`, `discontinuity`, `template_invalid`) always map to the vaguest hint `try_again`, even when other reasons are present, so the hint is never a face-match oracle.
- `/api/bio/enroll` failure hint = bio's enrollment reason (`no_face` / `multiple_faces` / `low_quality`): the user is signed in and just reauthenticated, the reason helps them fix lighting/framing.
- Step-up reason text and the "New sign-in from <country>" country come from the latest `step_up_required` event for the user (written by A's login route), so no query params or coordination are needed. Country codes are shown as names via `Intl.DisplayNames`.
- Final step-up failure stays on `/signin/step-up` with an explanation and a "Back to sign in" button (no redirect, so the message is readable); it also calls `/api/auth/logout` for non-attempt final errors.
- Capture: 3 s "get ready" countdown that already shows the first prompt; enrollment does not drop late frames (needs all 5), liveness does (timing stays honest).
- `LivenessSubmission` gained one OPTIONAL field `fake?: string` (contract rule: optional additions only). Nothing else in the frozen contracts changed.
- Bio decisions (model runtime, mediapipe pin, ~5 fps analysis, detector size, in-memory multipart) are in `docs/biometrics.md#decisions`.

## Handoff

### Done (how to try it)
1. `cd bio && uv sync && uv run python scripts/download_models.py` (models are already in `~/secure-bio/bio/models`). `bio/.env` exists here with the token from `web/.env.local`, a fresh key, `BIO_FAKE=1`.
2. `uv run fastapi dev app/main.py --port 8200` (fake) or `BIO_FAKE=0 uv run fastapi dev app/main.py --port 8200` (real models, ~1 s startup).
3. `cd web && pnpm dev -p 3200`.
4. Step-up: `pnpm dev:session tester --pending --face`, paste the cookie at http://localhost:3200, open `/signin/step-up`. Fake mode: pick the result in the dev picker; 3 failures sign the browser out. Real mode needs a real template first (enroll), not `--face`.
5. Enrollment / settings: `FaceEnrollPanel` and `FaceSettings` are only mounted by A's pages (`/signup`, `/security`). On this branch they were tested through a temporary page (deleted) and with curl: `POST /api/bio/enroll` multipart `meta={"consent":true}` + `frame_000..004`.
- Verified: enroll (consent required, exactly 5 frames, bad Origin 403, stale reauth `REAUTH_REQUIRED`), delete, step-up challenge only while pending (`FORBIDDEN` otherwise, `BIO_NOT_ENROLLED` without a face), pass → token rotated + `step_up_pass` + notification, fail → `step_up_fail` with bio detail in metadata only, 3rd fail → session revoked + cookie cleared, attempts carried across new challenges, attempt refunded when bio is down, real mode ignores `fake`.

### Not done / known issues
- Manual webcam check (enroll, live pass, phone photo/video, wrong order) and threshold calibration with a few people: need humans at a camera. Steps: run bio with `BIO_FAKE=0`, enroll via A's `/signup` or `/security` (after merge) or curl, then step-up as above; read `auth_events.metadata.bio.scores` for each try and record `name = value (date, n)` under `docs/biometrics.md#decisions`. Watch `HAND_FACE_MAX_DIST` (3 face widths) and `GESTURE_SCORE_MIN` on real hands first.
- The UI during capture was exercised in a hidden Chrome window (timers throttled to 1 s), so the countdown/prompt animation at real 10 fps has not been eyeballed. 360 px layout checked for the intro and final screens.
- `withReauth` retry path for enroll/delete needs A's `/api/auth/reauth/*` (master verifies after merge).
- Pass on `/signin/step-up` navigates to `/home` (A's page; 404 on this branch).
- Real-mode verify takes ~2.5-4 s for 40-80 frames on the dev laptop; `BIO_TIMEOUT_MS` is 20 s.
- Stretch items not started.

### For D (recovery)
- `createLivenessChallenge({userId, purpose:"recovery_liveness", targetId: recoveryId})`; `verifyLiveness` with the same `targetId`. The challenge is deleted at 0 attempts, so a later `createLivenessChallenge` would start with 3 again: cancel the request at 0 as your brief says.
- `<LivenessCheck>` treats `RECOVERY_STATE`, `RECOVERY_INVALID`, `NOT_FOUND`, `FORBIDDEN`, `UNAUTHENTICATED`, `BIO_NOT_ENROLLED` as final (calls `onFailedFinal`); `CHALLENGE_EXPIRED` and `BIO_UNAVAILABLE` are retryable inside the component.

### REQUEST / BUG / DOC
- DOC `docs/api.md` Biometrics: add `GET /api/bio/status` (none) → `{available, fake}`; `/bio/enroll` failure `hint` is `no_face | multiple_faces | low_quality`; liveness uploads use parts `frame_000`... (≤ 300 KB JPEG each) and `meta` may carry `fake` (dev only, ignored unless bio is in fake mode).
- DOC `docs/architecture.md` stack: mediapipe is pinned to 0.10.x and InsightFace runs on onnxruntime without the `insightface` package (see `docs/biometrics.md#decisions`).
- BUG `web/src/server/http.ts:29` `DEFAULT_MESSAGE` has no `BIO_NOT_ENROLLED` (or `BIO_UNAVAILABLE` is fine): `new ApiError("BIO_NOT_ENROLLED")` shows the raw code to users. Proposed: `BIO_NOT_ENROLLED: "Face check isn't set up for this account."` (worked around in `liveness.ts` by passing the message).
- REVIEW `web/src/server/bio/liveness.ts`: contract unchanged except the optional `LivenessSubmission.fake`.
- Note: `pnpm test` prints a pre-existing Vite warning about `vitest.config.ts` being ESM loaded as CommonJS (master-owned config; harmless).

### Test evidence (2026-10-13)
- `cd web && pnpm typecheck` OK, `pnpm lint` no errors/warnings, `pnpm test` 48 passed (4 files), `pnpm build` OK.
- `cd bio && uv run pytest` 84 passed (decision table, crypto, API contract in fake mode + real-mode guard, real-model smoke test).
- `scripts/check-scope.sh bio` OK.
