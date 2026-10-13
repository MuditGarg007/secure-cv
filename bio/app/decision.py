"""Pure pass/fail decisions over per-frame results (docs/biometrics.md#verify-decision-bio).

No models, no I/O: pipeline.py turns frames into FrameResult rows and calls decide().
Tested with synthetic rows in tests/test_decision.py.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from statistics import median

from app.config import (
    CAPTURE_WINDOW_MS,
    CONTINUITY_MIN,
    ENROLL_CONSISTENCY_MIN,
    ENROLL_FRAMES,
    ENROLL_MIN_FACE_PX,
    FACE_PRESENCE_MIN,
    FACE_SIM_THRESHOLD,
    GESTURE_HOLD_MS,
    GESTURE_MAX_GAP_MS,
    GESTURE_SCORE_MIN,
    HAND_FACE_MAX_DIST,
    TIMING_SLACK_MS,
)

# Verify reason codes, in the order of the decision table.
VERIFY_REASONS = (
    "multiple_faces",
    "no_face",
    "face_mismatch",
    "discontinuity",
    "prompt_missing",
    "timing",
)
# Extra verify reason when the stored template can't be decrypted for this user.
TEMPLATE_INVALID = "template_invalid"
ENROLL_REASONS = ("no_face", "multiple_faces", "low_quality")


@dataclass(frozen=True)
class FrameResult:
    """What the models saw in one frame."""

    t_ms: float  # client timestamp, relative to the first frame
    faces: int = 0  # faces detected (tiny background detections excluded)
    face_sim: float | None = None  # single face vs enrolled template (cosine)
    prev_sim: float | None = None  # single face vs the previous frame's face (cosine)
    gesture: str | None = None  # best recognised gesture, None if none
    gesture_score: float = 0.0
    hand_dist: float | None = None  # hand centre to face centre, in face widths


@dataclass(frozen=True)
class Thresholds:
    face_sim: float = FACE_SIM_THRESHOLD
    presence: float = FACE_PRESENCE_MIN
    continuity: float = CONTINUITY_MIN
    gesture_score: float = GESTURE_SCORE_MIN
    hold_ms: float = GESTURE_HOLD_MS
    max_gap_ms: float = GESTURE_MAX_GAP_MS
    hand_face_max_dist: float = HAND_FACE_MAX_DIST
    capture_window_ms: float = CAPTURE_WINDOW_MS
    timing_slack_ms: float = TIMING_SLACK_MS


DEFAULT_THRESHOLDS = Thresholds()


@dataclass(frozen=True)
class Decision:
    passed: bool
    reasons: list[str]
    scores: dict[str, float | int | None]

    def to_json(self) -> dict:
        return {"passed": self.passed, "reasons": self.reasons, "scores": self.scores}


def decide(
    frames: Sequence[FrameResult],
    prompts: Sequence[str],
    *,
    now_ms: float,
    expires_at_ms: float,
    timestamps: Sequence[float] | None = None,
    th: Thresholds = DEFAULT_THRESHOLDS,
) -> Decision:
    """Pass only if every row of the decision table holds. Reasons list every failed row.

    `frames` may be a subset of the upload (see select_frames); `timestamps` are then ALL the
    uploaded timestamps, so the timing row still covers every frame.
    """
    reasons: list[str] = []
    n = len(frames)
    single = [f for f in frames if f.faces == 1]

    if any(f.faces >= 2 for f in frames):
        reasons.append("multiple_faces")

    presence = len(single) / n if n else 0.0
    if presence < th.presence:
        reasons.append("no_face")

    sims = [f.face_sim for f in single if f.face_sim is not None]
    face_sim = float(median(sims)) if sims else None
    if face_sim is not None and face_sim < th.face_sim:
        reasons.append("face_mismatch")

    conts = [f.prev_sim for f in single if f.prev_sim is not None]
    continuity_min = min(conts) if conts else None
    if continuity_min is not None and continuity_min < th.continuity:
        reasons.append("discontinuity")

    matched = match_prompts(frames, prompts, th)
    if matched < len(prompts):
        reasons.append("prompt_missing")

    ts = list(timestamps) if timestamps is not None else [f.t_ms for f in frames]
    if not timing_ok(ts, now_ms=now_ms, expires_at_ms=expires_at_ms, th=th):
        reasons.append("timing")

    return Decision(
        passed=not reasons,
        reasons=reasons,
        scores={
            "faceSim": _r(face_sim),
            "presence": _r(presence),
            "continuityMin": _r(continuity_min),
            "promptsMatched": matched,
            "frames": n,
            "spanMs": round(ts[-1] - ts[0]) if ts else 0,
        },
    )


def _r(x: float | None) -> float | None:
    return None if x is None else round(float(x), 3)


def _bound(f: FrameResult, prompt: str, th: Thresholds) -> bool:
    """Frame shows `prompt` confidently AND the matching face, with the hand near that face."""
    return (
        f.gesture == prompt
        and f.gesture_score >= th.gesture_score
        and f.faces == 1
        and f.face_sim is not None
        and f.face_sim >= th.face_sim
        and (f.hand_dist is None or f.hand_dist <= th.hand_face_max_dist)
    )


def match_prompts(frames: Sequence[FrameResult], prompts: Sequence[str], th: Thresholds = DEFAULT_THRESHOLDS) -> int:
    """How many prompts were held long enough, in order. Each search starts after the previous hold."""
    i = 0
    for k, prompt in enumerate(prompts):
        start = last = None
        while i < len(frames):
            f = frames[i]
            i += 1
            if _bound(f, prompt, th):
                if start is None or f.t_ms - last > th.max_gap_ms:
                    start = f.t_ms
                last = f.t_ms
                if last - start >= th.hold_ms:
                    break
            elif f.gesture not in (None, prompt) and f.gesture_score >= th.gesture_score:
                start = None  # a different confident gesture breaks the hold
        else:
            return k
    return len(prompts)


def timing_ok(
    ts: Sequence[float], *, now_ms: float, expires_at_ms: float, th: Thresholds = DEFAULT_THRESHOLDS
) -> bool:
    """Timestamps strictly increasing from >= 0, span within the capture window, before expiry."""
    if now_ms > expires_at_ms:
        return False
    if not ts:
        return True  # nothing to time; no_face / prompt_missing already fail it
    if ts[0] < 0 or any(b <= a for a, b in zip(ts, ts[1:])):
        return False
    return ts[-1] - ts[0] <= th.capture_window_ms + th.timing_slack_ms


def select_frames(ts: Sequence[float], min_gap_ms: float) -> list[int]:
    """Indices of the frames to analyse: the first, then each frame >= min_gap_ms after the last
    pick, and always the last frame. Every analysed frame gets the full face + gesture checks."""
    picked: list[int] = []
    for i, t in enumerate(ts):
        if not picked or t - ts[picked[-1]] >= min_gap_ms:
            picked.append(i)
    if ts and picked[-1] != len(ts) - 1:
        picked.append(len(ts) - 1)
    return picked


@dataclass(frozen=True)
class EnrollFrame:
    faces: int
    face_px: float = 0.0  # bbox width of the face when faces == 1


def enroll_reason(
    frames: Sequence[EnrollFrame], pair_sims: Sequence[float], *, expected: int = ENROLL_FRAMES
) -> str | None:
    """None if the frames make a good template, else a reason from ENROLL_REASONS."""
    if len(frames) != expected:
        return "low_quality"
    if any(f.faces >= 2 for f in frames):
        return "multiple_faces"
    if any(f.faces == 0 for f in frames):
        return "no_face"
    if any(f.face_px < ENROLL_MIN_FACE_PX for f in frames):
        return "low_quality"
    if pair_sims and min(pair_sims) < ENROLL_CONSISTENCY_MIN:
        return "low_quality"  # not the same person in every frame
    return None
