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
- [ ] `bio/`: uv project pinned to **Python 3.12** (mediapipe has no 3.14 wheels; `uv python install 3.12` if needed). FastAPI app `bio/app/main.py`, `config.py` (pydantic-settings + all thresholds from `docs/biometrics.md`), `X-Internal-Token` check on every route (protecting `/healthz` too is fine; record your choice), `GET /healthz`, `POST /enroll`, `POST /verify` per `docs/biometrics.md#bio-api`. `bio/.env.example`.
- [ ] `bio/app/crypto.py`: AES-256-GCM template blob `nonce(12)|ct|tag`, AAD = userId. pytest: round trip, wrong user fails, tamper fails.
- [ ] `BIO_FAKE=1`: no models loaded, decision from `meta.fake` (`"pass"` / `"fail:<reason>"`); enroll returns a real encrypted dummy template so the crypto path is exercised.
- [ ] `web/src/server/bio/client.ts`: calls bio with `X-Internal-Token`, timeout `BIO_TIMEOUT_MS`, any network error → `ApiError("BIO_UNAVAILABLE")`. Never log frames or scores.
- [ ] `web/src/server/bio/challenge.ts`: pure prompt generator (`PROMPT_COUNT`, no two consecutive alike, crypto randomness) + `challenge.test.ts`.
- [ ] Implement `liveness.ts` for real (multipart parsing with zod for `meta`, frame count ≤ `MAX_LIVENESS_FRAMES`, timestamps monotonic, attempts handling).
- [ ] Routes: `POST /api/bio/enroll` (full+reauth, `meta.consent === true` required, exactly `ENROLL_FRAME_COUNT` frames, stores `templateEnc` in `users.face_template_enc`, `bio_enrolled` event), `DELETE /api/bio` (full+reauth, null the column, `bio_deleted` event).
- [ ] `POST /api/stepup/challenge` + `POST /api/stepup/verify`: `requireSession({allowPending:true})`, only valid while `session.stepUpPending` (else `FORBIDDEN`). Pass → `completeStepUp`, `step_up_pass` event (bio detail in metadata), `notify(user, "New sign-in from <country>")`. Fail → `step_up_fail` event; 0 attempts → `endCurrentSession`. Response = `toClientResult(...)` only (no scores, rule 9).
- [ ] `web/src/lib/camera.ts`: `getUserMedia` 640×480 user-facing, 10 fps JPEG q0.7 with `performance.now()` timestamps relative to the first frame, max frames, stop tracks on unmount.
- [ ] Fake-mode dev switch: decide how the tester picks pass/fail in fake mode (e.g. web forwards `fake` only when bio reports fake mode), record under Decisions. It must be impossible for a browser to influence a real-mode decision.
- [ ] `/signin/step-up` page: reason text from `docs/flows.md §3`, `<LivenessCheck challengeUrl="/api/stepup/challenge" verifyUrl="/api/stepup/verify">`, pass → `/home`, final fail → signed out → `/signin` with a message.
- [ ] Real `LivenessCheck`, `FaceEnrollPanel`, `FaceSettings`.

### Phase 2: real models
- [ ] `bio/scripts/download_models.py`: InsightFace `buffalo_l` (SCRFD + ArcFace ONNX) and MediaPipe `gesture_recognizer.task` into `bio/models/` (gitignored). If the `insightface` pip package won't build, run the two ONNX models directly with onnxruntime + numpy (record the decision).
- [ ] `bio/app/pipeline.py`: decode JPEG in memory, face detect + embed, gesture recognition, then the decision table in `docs/biometrics.md#verify-decision-bio`. Keep the decision a pure function over per-frame results.
- [ ] pytest for the decision function with synthetic per-frame results: each reason code, prompt order, hold time, face/gesture co-presence, timing, pass case.
- [ ] Manual check with a real webcam on port 3200: enroll, step-up pass live, fail with a phone photo/video, wrong gesture order.
- [ ] Calibrate thresholds with a few people, write results under `docs/biometrics.md#decisions`.

### Stretch (only after everything above)
In-browser MediaPipe prompt ticking (UX only), MiniFASNet anti-spoof.

## How to test before A's login is merged
Your branch has no `/api/auth/*`, so no real passkey sessions. Never add a login backdoor to the app. Use the dev CLI (`docs/foundation.md#dev-sessions`): `pnpm dev:session tester --pending --face` gives a step-up-pending session for `/signin/step-up` (`--face` writes a placeholder template that can't be decrypted: in fake mode, skip decryption when the blob is `DEV-FAKE-TEMPLATE`, or enroll through your UI first to get a real one); `pnpm dev:session tester` gives a fresh full session for enrollment (reauth is fresh for 5 min). The `withReauth` retry path needs A's routes and is verified by the master after merge.

## Status
_Tick the task boxes above as you commit; short progress notes here._

## Decisions

## Handoff
