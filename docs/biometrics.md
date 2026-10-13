# Biometrics: face + gesture liveness

This is the project's USP. Keep it working and demoable before polishing anything else.

## What it is for
- **Step-up**: a passkey login that looks risky must also pass a liveness check.
- **Recovery**: recovery code + liveness gives a shorter cooldown than code alone.
- Never a login on its own. Faces are public and webcam video can be relayed or injected; passkeys are origin-bound. See `docs/security.md`.

## How it works

```
enroll:  5 face frames ──► bio: detect + embed ──► mean embedding ──► AES-GCM ──► blob stored in web DB
verify:  server picks 3 random gestures ──► user shows each gesture NEXT TO their face on camera
         ──► ~6 s of frames ──► bio checks: same face throughout + gestures in order + on time ──► pass/fail
```

The random prompt sequence is what defeats photos and pre-recorded videos: a recording made earlier won't contain this challenge's gestures in this order. Requiring the gesture and the matching face in the same frames stops splicing a hand video onto a face video.

## Gesture prompts
MediaPipe GestureRecognizer canned classes:
```
Closed_Fist, Open_Palm, Pointing_Up, Thumb_Up, Thumb_Down, Victory, ILoveYou
```
- Web picks `PROMPT_COUNT = 3`, no two consecutive alike (252 possible sequences).
- Challenge TTL 120 s, capture window 8 s, max 3 verify attempts per challenge.
- Generation lives in `web/src/server/bio/challenge.ts`.

## Face
- Enrollment: 5 frames, exactly one face, face at least 100 px wide. Template = L2-normalized mean ArcFace embedding (512-d).
- Match: cosine similarity ≥ `FACE_SIM_THRESHOLD`.

## Verify decision (bio)
Sample frames, run face detection + embedding and gesture recognition on each. Pass only if ALL hold:

| Check | Rule | Reason code |
|---|---|---|
| single face | no frame with 2+ faces | `multiple_faces` |
| presence | face found in ≥ `FACE_PRESENCE_MIN` of frames | `no_face` |
| identity | median similarity to template ≥ `FACE_SIM_THRESHOLD` | `face_mismatch` |
| continuity | consecutive embeddings similarity ≥ `CONTINUITY_MIN` (catches cuts/swaps) | `discontinuity` |
| prompts | each gesture held ≥ `GESTURE_HOLD_MS` with score ≥ `GESTURE_SCORE_MIN`, in order | `prompt_missing` |
| bound | the matching face is present in the frames where each gesture is detected, with the hand within `HAND_FACE_MAX_DIST` face widths of it | `prompt_missing` |
| timing | timestamps strictly increasing, span ≤ capture window + `TIMING_SLACK_MS`, received before challenge expiry | `timing` |

Bio analyses the frames at least `ANALYZE_MIN_GAP_MS` apart (~5 fps of the 10 fps upload, always including the last). Every analysed frame gets detection, embedding and gesture recognition; the timing row still checks every uploaded timestamp. A hold survives one misread analysed frame (`GESTURE_MAX_GAP_MS`); a different confident gesture breaks it. Stored template that fails to decrypt (wrong user, wrong key, tampered) → `template_invalid`.

Starting values in `bio/app/config.py` (calibrate with team captures, record results under Decisions):
```
FACE_SIM_THRESHOLD = 0.45
FACE_PRESENCE_MIN  = 0.8
CONTINUITY_MIN     = 0.6
GESTURE_SCORE_MIN  = 0.6
GESTURE_HOLD_MS    = 300
GESTURE_MAX_GAP_MS = 450
HAND_FACE_MAX_DIST = 3.0     # face widths
ANALYZE_MIN_GAP_MS = 180
TIMING_SLACK_MS    = 1000
```
Enrollment: exactly 5 frames, one face each, face ≥ 100 px wide, every pair of frame embeddings ≥ `ENROLL_CONSISTENCY_MIN` (0.6) so two people can't be mixed into one template.

## Capture (browser)
- `getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } })`.
- 10 fps, JPEG quality 0.7, `performance.now()` timestamp per frame, max 80 frames.
- 3 s "get ready" countdown showing the first prompt, then the 8 s window split evenly between the prompts.
- Show one prompt card at a time (emoji + text + spoken via `speechSynthesis`) and a countdown bar.
- POST as multipart to web: `meta` JSON + parts named `frame_000`, `frame_001`... (filename `frame_NNN.jpg`, `image/jpeg`, ≤ 300 KB each). Same layout from web to bio.
- Each retry fetches a new challenge (fresh prompts). Remaining attempts carry over to the new challenge for the same user/purpose/target, so new prompts never reset the limit.
- Capture code: `web/src/lib/camera.ts`; UI: `web/src/components/bio/`.
- Stretch: run MediaPipe in the browser to tick prompts live. UX only; the server ignores it.

## Client response
Web strips bio's scores and returns only:
```json
{ "passed": false, "hint": "face_not_visible" | "gesture_not_seen" | "too_slow" | "try_again", "attemptsLeft": 2 }
```
Full bio result goes into `auth_events.metadata`.

Hint mapping (`web/src/server/bio/rules.ts`): any of `face_mismatch` / `discontinuity` / `template_invalid` → `try_again` (never reveal whether the face matched), else `timing` → `too_slow`, else `no_face` / `multiple_faces` → `face_not_visible`, else `prompt_missing` → `gesture_not_seen`.

Enrollment (`POST /api/bio/enroll`) returns `{ok:false, hint}` with bio's reason as the hint: `no_face` | `multiple_faces` | `low_quality`.

## Bio API
All requests need `X-Internal-Token`. Templates are base64 blobs: `nonce(12) | ciphertext | tag`, AES-256-GCM, AAD = userId (a blob can't be moved to another user).

`POST /enroll` multipart `meta={"userId"}` + 5 frames
→ `{ "ok": true, "templateEnc": "..." }` or `{ "ok": false, "reason": "no_face" | "multiple_faces" | "low_quality" }`

`POST /verify` multipart + frames, meta:
```json
{ "userId": "...", "templateEnc": "...", "prompts": ["Victory","Thumb_Up","Open_Palm"],
  "expiresAt": "ISO", "timestamps": [0, 101, 199] }
```
→ `{ "passed": true, "reasons": [], "scores": { "faceSim": 0.62, "presence": 0.95, "continuityMin": 0.8, "promptsMatched": 3 } }`

`GET /healthz` → `{ "ok": true, "fake": false }`

`BIO_FAKE=1`: skip models; `meta.fake` = `"pass"` (default) or `"fail:<reason>"` decides. Enroll still returns a real encrypted (random) template; verify still decrypts the template, except the `DEV-FAKE-TEMPLATE` placeholder from `pnpm dev:session --face`. For dev and tests only. Real mode never reads `meta.fake`.

Errors: 401 bad/missing token (every route, `/healthz` included), 400 bad multipart/meta (input never echoed), 413 part too large. Web maps any bio failure to `BIO_UNAVAILABLE`.

### Running bio
```
cd bio
uv sync
uv run python scripts/download_models.py    # ~290 MB download, sha256-pinned, into bio/models/
cp .env.example .env                         # set BIO_INTERNAL_TOKEN (= web) and BIO_TEMPLATE_KEY
uv run fastapi dev app/main.py --port 8000   # BIO_FAKE=1 in .env (or env) for fake mode
uv run pytest
```
Web side: `GET /api/bio/status` → `{available, fake}` (no auth, reveals nothing else). While bio reports fake mode, the capture UI shows a dev picker for the fake result and falls back to a synthetic camera if there is none. Web forwards `fake` to bio only while bio reports fake mode.

## Privacy
- Frames processed in memory only, never written to disk or logs (web or bio).
- Consent checkbox before the camera opens at enrollment.
- User can delete their biometrics; step-up then blocks risky logins and recovery uses the longer code-only cooldown.

## Stretch
- Passive anti-spoof model (MiniFASNet) on face crops.
- User-defined custom gesture as an extra personal factor.
- Live in-browser prompt ticking with MediaPipe.

## Decisions

_Record calibrated thresholds here: `name = value (date, sample size)`._

- Thresholds are still the starting values: not yet calibrated with live people (needs a human at a webcam, see `docs/agents/bio.md#handoff`). Synthetic check (2026-10-13, scikit-image public-domain portraits + MediaPipe sample hands): same face under rotation/scale/mirror/grayscale 0.96-0.99, different person -0.03, so 0.45 has wide margins on both sides; composite live sequence passes, wrong order / static photo / other face / spliced face all fail.
- InsightFace models run directly on onnxruntime + numpy (SCRFD decode, Umeyama alignment, ArcFace) instead of the `insightface` pip package: no Cython build, far fewer dependencies, same weights.
- `mediapipe` pinned to 0.10.x: 1.1.0 gets SIGKILLed while creating the GestureRecognizer on the dev machine (Linux 7.2, Python 3.12); 0.10.35 works.
- Analyse ~5 fps (`ANALYZE_MIN_GAP_MS = 180`): ArcFace R50 costs ~60 ms per face on a shared laptop CPU, 80 frames took ~8.5 s; analysing every second frame takes ~4 s. Every analysed frame still gets the full face + gesture checks (no interpolation between frames, so frames can't be interleaved to sneak a different face into gesture frames).
- Detector input 480×352 (640×480 frames scaled to fit): ~2x faster than full size; faces ≥ 40 px still found.
- One GestureRecognizer per verify request in VIDEO mode (tracking across frames needs increasing timestamps, so it can't be shared between concurrent requests); creation is cheap compared with face embedding.
- Hand-near-face (`HAND_FACE_MAX_DIST = 3` face widths) is part of the "bound" row: the prompt says "next to your face" and it makes splicing a hand clip into a face clip harder.
- Upload parsing in bio is our own in-memory multipart reader: Starlette spools file parts > 1 MB to a temp file, which would put frames on disk.
