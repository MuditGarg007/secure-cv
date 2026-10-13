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
| bound | the matching face is present in the frames where each gesture is detected | `prompt_missing` |
| timing | frames span ≤ capture window, received before challenge expiry | `timing` |

Starting values in `bio/app/config.py` (calibrate with team captures, record results under Decisions):
```
FACE_SIM_THRESHOLD = 0.45
FACE_PRESENCE_MIN  = 0.8
CONTINUITY_MIN     = 0.6
GESTURE_SCORE_MIN  = 0.6
GESTURE_HOLD_MS    = 300
```

## Capture (browser)
- `getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } })`.
- 10 fps, JPEG quality 0.7, `performance.now()` timestamp per frame, max 80 frames.
- Show one prompt card at a time (emoji + text + spoken via `speechSynthesis`) and a countdown bar.
- POST as multipart to web: `meta` JSON + `frame_000.jpg`...
- Stretch: run MediaPipe in the browser to tick prompts live. UX only; the server ignores it.

## Client response
Web strips bio's scores and returns only:
```json
{ "passed": false, "hint": "face_not_visible" | "gesture_not_seen" | "too_slow" | "try_again", "attemptsLeft": 2 }
```
Full bio result goes into `auth_events.metadata`.

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

`GET /healthz` → `{ "ok": true }`

`BIO_FAKE=1`: skip models; `meta.fake` = `"pass"` or `"fail:<reason>"` decides. For dev and tests only.

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
