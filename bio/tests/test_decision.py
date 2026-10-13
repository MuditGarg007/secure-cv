"""Decision table (docs/biometrics.md#verify-decision-bio) over synthetic per-frame results."""

from dataclasses import replace

import pytest

from app.config import (
    CAPTURE_WINDOW_MS,
    CONTINUITY_MIN,
    ENROLL_MIN_FACE_PX,
    FACE_SIM_THRESHOLD,
    GESTURE_HOLD_MS,
    GESTURE_SCORE_MIN,
    HAND_FACE_MAX_DIST,
    TIMING_SLACK_MS,
)
from app.decision import (
    EnrollFrame,
    FrameResult,
    decide,
    enroll_reason,
    match_prompts,
    select_frames,
    timing_ok,
)

PROMPTS = ["Victory", "Thumb_Up", "Open_Palm"]
NOW = 1_000_000.0
EXPIRES = NOW + 60_000


def capture(prompts=PROMPTS, n=80, step=100, react_ms=800) -> list[FrameResult]:
    """A good live capture: same face throughout, each prompt shown in its slot after a reaction delay."""
    slot = n * step / len(prompts)
    frames = []
    for k in range(n):
        t = k * step
        idx = min(int(t // slot), len(prompts) - 1)
        shown = t - idx * slot >= react_ms
        frames.append(
            FrameResult(
                t_ms=t,
                faces=1,
                face_sim=0.7,
                prev_sim=0.95 if k else None,
                gesture=prompts[idx] if shown else None,
                gesture_score=0.9 if shown else 0.0,
                hand_dist=1.2 if shown else None,
            )
        )
    return frames


def run(frames, prompts=PROMPTS, now=NOW, expires=EXPIRES):
    return decide(frames, prompts, now_ms=now, expires_at_ms=expires)


def edit(frames, pred, **changes):
    return [replace(f, **changes) if pred(i, f) else f for i, f in enumerate(frames)]


def test_live_capture_passes():
    d = run(capture())
    assert d.passed, d.reasons
    assert d.reasons == []
    assert d.scores["promptsMatched"] == 3
    assert d.scores["presence"] == 1.0
    assert d.scores["faceSim"] == 0.7
    assert d.scores["frames"] == 80


def test_scores_are_json_numbers():
    d = run(capture())
    assert set(d.scores) == {"faceSim", "presence", "continuityMin", "promptsMatched", "frames", "spanMs"}
    assert d.to_json()["passed"] is True


# ---- single face ----
def test_second_face_in_one_frame_fails():
    d = run(edit(capture(), lambda i, f: i == 40, faces=2, face_sim=None, prev_sim=None))
    assert not d.passed
    assert "multiple_faces" in d.reasons


# ---- presence ----
def test_face_missing_in_too_many_frames():
    frames = edit(capture(), lambda i, f: i % 4 == 0, faces=0, face_sim=None, prev_sim=None)
    d = run(frames)
    assert "no_face" in d.reasons
    assert d.scores["presence"] == 0.75


def test_presence_at_threshold_ok():
    frames = capture()
    idle = [i for i, f in enumerate(frames) if f.gesture is None][:16]  # 16 of 80 = presence 0.8
    d = run(edit(frames, lambda i, f: i in idle, faces=0, face_sim=None, prev_sim=None))
    assert d.scores["presence"] == 0.8
    assert d.passed, d.reasons


def test_no_frames_fails():
    d = run([])
    assert not d.passed
    assert {"no_face", "prompt_missing"} <= set(d.reasons)


# ---- identity ----
def test_other_person_fails():
    d = run(edit(capture(), lambda i, f: True, face_sim=0.2))
    assert "face_mismatch" in d.reasons


def test_median_tolerates_a_few_bad_frames():
    frames = edit(capture(), lambda i, f: i < 10 and f.gesture is None, face_sim=0.1)
    assert "face_mismatch" not in run(frames).reasons


def test_identity_threshold_boundary():
    at = run(edit(capture(), lambda i, f: True, face_sim=FACE_SIM_THRESHOLD))
    below = run(edit(capture(), lambda i, f: True, face_sim=FACE_SIM_THRESHOLD - 0.01))
    assert "face_mismatch" not in at.reasons
    assert "face_mismatch" in below.reasons


# ---- continuity ----
def test_cut_between_frames_fails():
    d = run(edit(capture(), lambda i, f: i == 30, prev_sim=CONTINUITY_MIN - 0.1))
    assert "discontinuity" in d.reasons
    assert d.scores["continuityMin"] == pytest.approx(CONTINUITY_MIN - 0.1)


# ---- prompts ----
def test_wrong_order_fails():
    frames = capture(prompts=list(reversed(PROMPTS)))
    d = run(frames)
    assert "prompt_missing" in d.reasons
    assert d.scores["promptsMatched"] < 3


def test_order_checked_not_just_presence():
    # All three gestures are shown, but prompt 2 before prompt 1: Victory matches, Thumb_Up never follows it.
    frames = capture(prompts=["Thumb_Up", "Victory", "Open_Palm"])
    assert match_prompts(frames, PROMPTS) == 1
    assert "prompt_missing" in run(frames).reasons


def test_missing_gesture_fails():
    frames = edit(capture(), lambda i, f: f.gesture == "Thumb_Up", gesture=None, gesture_score=0.0)
    d = run(frames)
    assert "prompt_missing" in d.reasons
    assert d.scores["promptsMatched"] == 1


def test_gesture_must_be_held():
    # Each gesture visible for only 2 frames (100 ms span) per slot.
    frames = capture()
    keep = set()
    for g in PROMPTS:
        idx = [i for i, f in enumerate(frames) if f.gesture == g]
        keep.update(idx[:2])
    frames = edit(frames, lambda i, f: f.gesture and i not in keep, gesture=None, gesture_score=0.0)
    assert match_prompts(frames, PROMPTS) == 0


def test_hold_exactly_threshold_counts():
    step = 100
    n = GESTURE_HOLD_MS // step + 1  # frames spanning exactly GESTURE_HOLD_MS
    frames = [FrameResult(t_ms=i * step, faces=1, face_sim=0.7, gesture="Victory", gesture_score=0.9) for i in range(n)]
    assert match_prompts(frames, ["Victory"]) == 1
    assert match_prompts(frames[:-1], ["Victory"]) == 0


def test_hold_survives_one_dropped_frame():
    frames = [
        FrameResult(t_ms=i * 100, faces=1, face_sim=0.7, gesture=None if i == 2 else "Victory", gesture_score=0.9)
        for i in range(5)
    ]
    assert match_prompts(frames, ["Victory"]) == 1


def test_long_gap_restarts_hold():
    ts = [0, 100, 600, 700]  # 500 ms gap > GESTURE_MAX_GAP_MS
    frames = [FrameResult(t_ms=t, faces=1, face_sim=0.7, gesture="Victory", gesture_score=0.9) for t in ts]
    assert match_prompts(frames, ["Victory"]) == 0


def test_other_confident_gesture_breaks_hold():
    names = ["Victory", "Victory", "Thumb_Up", "Victory", "Victory"]
    frames = [FrameResult(t_ms=i * 100, faces=1, face_sim=0.7, gesture=g, gesture_score=0.9) for i, g in enumerate(names)]
    assert match_prompts(frames, ["Victory"]) == 0


def test_low_score_gesture_ignored():
    frames = edit(capture(), lambda i, f: f.gesture == "Open_Palm", gesture_score=GESTURE_SCORE_MIN - 0.1)
    assert "prompt_missing" in run(frames).reasons


# ---- bound: gesture and the matching face in the same frames ----
def test_gesture_without_face_does_not_count():
    # Face hidden in 4 of every 5 Thumb_Up frames: overall presence is fine, but the gesture
    # is never seen together with the face for long enough.
    frames = edit(
        capture(), lambda i, f: f.gesture == "Thumb_Up" and i % 5, faces=0, face_sim=None, prev_sim=None
    )
    d = run(frames)
    assert "no_face" not in d.reasons
    assert "prompt_missing" in d.reasons


def test_gesture_with_other_face_does_not_count():
    # Spliced clip: someone else's face while one gesture is shown; overall median still matches.
    frames = edit(capture(), lambda i, f: f.gesture == "Thumb_Up", face_sim=0.1)
    d = run(frames)
    assert "face_mismatch" not in d.reasons
    assert "prompt_missing" in d.reasons


def test_hand_far_from_face_does_not_count():
    frames = edit(capture(), lambda i, f: f.gesture is not None, hand_dist=HAND_FACE_MAX_DIST + 1)
    assert "prompt_missing" in run(frames).reasons


# ---- timing ----
def test_span_longer_than_window_fails():
    step = (CAPTURE_WINDOW_MS + TIMING_SLACK_MS + 500) / 79
    d = run(capture(step=step))
    assert "timing" in d.reasons


def test_received_after_expiry_fails():
    d = run(capture(), now=EXPIRES + 1)
    assert "timing" in d.reasons
    assert not d.passed


def test_non_monotonic_timestamps_fail():
    frames = capture()
    frames[10] = replace(frames[10], t_ms=frames[9].t_ms)
    assert not timing_ok([f.t_ms for f in frames], now_ms=NOW, expires_at_ms=EXPIRES)


def test_negative_start_fails():
    assert not timing_ok([f.t_ms - 50 for f in capture()], now_ms=NOW, expires_at_ms=EXPIRES)


def test_timing_covers_all_uploaded_frames_not_just_analysed_ones():
    frames = capture()[::2]  # analysed subset looks fine...
    all_ts = [f.t_ms for f in capture()]
    all_ts[5] = all_ts[4]  # ...but an unanalysed frame breaks monotonic order
    d = decide(frames, PROMPTS, now_ms=NOW, expires_at_ms=EXPIRES, timestamps=all_ts)
    assert d.reasons == ["timing"]


def test_subsampled_live_capture_still_passes():
    sub = [capture()[i] for i in select_frames([f.t_ms for f in capture()], 180)]
    assert run(sub).passed


# ---- frame selection ----
def test_select_frames_about_5fps_from_10fps():
    ts = [i * 100 for i in range(80)]
    picked = select_frames(ts, 180)
    assert picked[:4] == [0, 2, 4, 6]
    assert picked[-1] == 79  # last frame always analysed
    assert len(picked) == 41


def test_select_frames_with_jitter():
    ts = [0, 95, 190, 300, 380, 480, 590]
    assert select_frames(ts, 180) == [0, 2, 4, 6]


def test_select_frames_edge_cases():
    assert select_frames([], 180) == []
    assert select_frames([0], 180) == [0]
    assert select_frames([0, 50], 180) == [0, 1]


def test_every_failed_row_is_reported():
    frames = edit(capture(), lambda i, f: True, face_sim=0.1, gesture=None, gesture_score=0.0)
    d = run(frames, now=EXPIRES + 1)
    assert d.reasons == ["face_mismatch", "prompt_missing", "timing"]


# ---- enrollment ----
def good_enroll():
    return [EnrollFrame(faces=1, face_px=180)] * 5


SIMS_OK = [0.8] * 10


def test_enroll_ok():
    assert enroll_reason(good_enroll(), SIMS_OK) is None


@pytest.mark.parametrize(
    ("frame", "reason"),
    [
        (EnrollFrame(faces=0), "no_face"),
        (EnrollFrame(faces=2), "multiple_faces"),
        (EnrollFrame(faces=1, face_px=ENROLL_MIN_FACE_PX - 1), "low_quality"),
    ],
)
def test_enroll_bad_frame(frame, reason):
    frames = good_enroll()
    frames[2] = frame
    assert enroll_reason(frames, SIMS_OK) == reason


def test_enroll_two_people_rejected():
    assert enroll_reason(good_enroll(), [0.8] * 9 + [0.2]) == "low_quality"


def test_enroll_wrong_frame_count():
    assert enroll_reason(good_enroll()[:4], SIMS_OK) == "low_quality"
