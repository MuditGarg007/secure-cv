"""Custom hand-shape features (app/handpose.py) and enrollment (decision.enroll_pose) on synthetic hands."""

import numpy as np
import pytest

from app.config import (
    GESTURE_ENROLL_CAPTURES,
    GESTURE_ENROLL_FRAMES_PER_CAPTURE,
    POSE_TAU_MAX,
    POSE_TAU_MIN,
)
from app.decision import enroll_pose
from app.handpose import POSE_FEATURE_DIM, cross_capture_nn, nearest, pose_distance, pose_features

# Knuckle (MCP) positions of a right hand, palm facing the camera, fingers up (y down in image).
MCPS = {1: (-0.35, -0.25), 5: (-0.3, -1.0), 9: (0.0, -1.0), 13: (0.28, -0.95), 17: (0.52, -0.85)}


def hand(extended=(True, True, True, True, True), mirror=False) -> np.ndarray:
    """21 x 3 landmarks. Extended fingers go straight up; curled ones fold toward the palm (z)."""
    p = np.zeros((21, 3))
    for f, base in enumerate((1, 5, 9, 13, 17)):
        x, y = MCPS[base]
        p[base] = (x, y, 0.0)
        for j in range(1, 4):
            if extended[f]:
                p[base + j] = (x - (0.25 * j if f == 0 else 0), y - 0.3 * j, 0.0)
            else:
                p[base + j] = (x, y + 0.1 * j, -0.25 * min(j, 2))
    if mirror:
        p[:, 0] *= -1
    return p


def rot_z(deg: float) -> np.ndarray:
    a = np.radians(deg)
    return np.array([[np.cos(a), -np.sin(a), 0], [np.sin(a), np.cos(a), 0], [0, 0, 1]])


OPEN = hand()
FIST = hand((False,) * 5)
VICTORY = hand((False, True, True, False, False))
POINT = hand((False, True, False, False, False))
ROCK = hand((False, True, False, False, True))


def f(p):
    out = pose_features(p)
    assert out is not None
    return out


def test_feature_size():
    assert f(OPEN).shape == (POSE_FEATURE_DIM,)


def test_same_hand_is_zero():
    assert pose_distance(f(VICTORY), f(VICTORY)) == pytest.approx(0, abs=1e-6)


def test_position_and_size_do_not_matter():
    moved = VICTORY * 0.6 + np.array([3.0, -2.0, 0.5])
    assert pose_distance(f(VICTORY), f(moved)) == pytest.approx(0, abs=1e-5)


def test_small_tilt_stays_within_threshold():
    tilted = VICTORY @ rot_z(20).T
    assert pose_distance(f(VICTORY), f(tilted)) < POSE_TAU_MIN


def test_landmark_jitter_stays_within_threshold():
    rng = np.random.default_rng(1)
    noisy = VICTORY + rng.normal(0, 0.04, VICTORY.shape)
    assert pose_distance(f(VICTORY), f(noisy)) < POSE_TAU_MIN


def test_upside_down_is_not_the_same():
    assert pose_distance(f(VICTORY), f(VICTORY @ rot_z(180).T)) > pose_distance(f(VICTORY), f(VICTORY @ rot_z(20).T))


@pytest.mark.parametrize("other", [OPEN, FIST, POINT, ROCK])
def test_different_shapes_are_far(other):
    assert pose_distance(f(VICTORY), f(other)) > POSE_TAU_MAX


def test_other_hand_does_not_match():
    assert pose_distance(f(ROCK), f(hand((False, True, False, False, True), mirror=True))) > POSE_TAU_MAX


def test_degenerate_hand_rejected():
    assert pose_features(np.zeros((21, 3))) is None


def test_nearest_picks_closest_row():
    tpl = np.stack([f(OPEN), f(VICTORY)])
    assert nearest(f(VICTORY), tpl) == pytest.approx(0, abs=1e-6)


def test_cross_capture_ignores_same_capture():
    samples = np.stack([f(VICTORY), f(VICTORY), f(POINT)])
    nn = cross_capture_nn(samples, [0, 0, 1])
    assert nn[0] == pytest.approx(pose_distance(f(VICTORY), f(POINT)))


# ---- enrollment ----
def frames(shape=VICTORY, seed=0, noise=0.02):
    rng = np.random.default_rng(seed)
    n = GESTURE_ENROLL_CAPTURES * GESTURE_ENROLL_FRAMES_PER_CAPTURE
    return [[f(shape + rng.normal(0, noise, shape.shape))] for _ in range(n)]


def test_enroll_pose_ok():
    out = enroll_pose(frames())
    assert out.reason is None
    assert out.samples is not None and out.samples.shape == (15, POSE_FEATURE_DIM)
    assert POSE_TAU_MIN <= out.tau <= POSE_TAU_MAX


def test_enroll_pose_tau_grows_with_shakiness_but_is_capped():
    steady = enroll_pose(frames(noise=0.005)).tau
    shaky = enroll_pose(frames(noise=0.06)).tau
    assert steady == POSE_TAU_MIN
    assert shaky >= steady
    assert shaky <= POSE_TAU_MAX


def test_enroll_pose_needs_hands_in_every_capture():
    fs = frames()
    for i in range(GESTURE_ENROLL_FRAMES_PER_CAPTURE, 2 * GESTURE_ENROLL_FRAMES_PER_CAPTURE - 1):
        fs[i] = []  # second capture: only one frame has a hand
    assert enroll_pose(fs).reason == "no_hand"


def test_enroll_pose_rejects_two_hands():
    fs = frames()
    fs[3] = [f(VICTORY), f(OPEN)]
    assert enroll_pose(fs).reason == "multiple_hands"


def test_enroll_pose_rejects_a_different_shape_each_time():
    n = GESTURE_ENROLL_FRAMES_PER_CAPTURE
    fs = [[f(VICTORY)]] * n + [[f(OPEN)]] * n + [[f(FIST)]] * n
    assert enroll_pose(fs).reason == "gesture_unstable"


def test_enroll_pose_wrong_frame_count():
    assert enroll_pose(frames()[:-1]).reason == "no_hand"
