"""Custom hand-shape matching from MediaPipe hand landmarks (docs/biometrics.md#custom-gesture).

Pure numpy, no models: gesture.py hands us 21 world landmarks per hand, this module turns them
into a feature vector and compares vectors. No training: the user's own enrollment samples are
the template, matched by nearest neighbour against a per-user threshold.

Feature vector (POSE_FEATURE_DIM = 66):
- 60: the 20 non-wrist landmarks in a hand-attached frame (origin wrist, y wrist -> middle
  knuckle, x index knuckle -> little knuckle, z = x cross y), scaled by palm length. This is
  the shape: invariant to where the hand is, how big it looks and how it is turned. Left and
  right hands are mirror images in this frame, so the same shape on the other hand does not
  match.
- 6: the frame's y and z axes in camera coordinates (where the fingers and the palm point), so
  orientation still counts a little (thumbs up vs thumbs down is the same shape turned over).
"""

from collections.abc import Sequence

import numpy as np

from app.config import POSE_ORIENT_WEIGHT

WRIST, INDEX_MCP, MIDDLE_MCP, PINKY_MCP = 0, 5, 9, 17
N_LANDMARKS = 21
SHAPE_DIM = (N_LANDMARKS - 1) * 3
POSE_FEATURE_DIM = SHAPE_DIM + 6


def pose_features(landmarks: np.ndarray) -> np.ndarray | None:
    """(21, 3) landmarks -> (66,) feature vector, or None for a degenerate hand."""
    p = np.asarray(landmarks, dtype=np.float64).reshape(N_LANDMARKS, 3)
    p = p - p[WRIST]
    palm = float(np.linalg.norm(p[MIDDLE_MCP]))
    if not np.isfinite(palm) or palm < 1e-6:
        return None
    y = p[MIDDLE_MCP] / palm
    across = p[INDEX_MCP] - p[PINKY_MCP]
    x = across - (across @ y) * y
    nx = float(np.linalg.norm(x))
    if nx < 1e-6:
        return None
    x /= nx
    z = np.cross(x, y)
    local = (p[1:] @ np.stack([x, y, z]).T) / palm
    return np.concatenate([local.reshape(-1), y, z]).astype(np.float32)


def pose_distance(a: np.ndarray, b: np.ndarray) -> float:
    """Shape error in palm lengths + a small orientation term. 0 = identical.

    Shape error = mean of (average finger, worst finger), where each finger's error is the RMS
    over its 4 landmarks. The worst-finger half keeps a one-finger difference (victory vs point)
    from being diluted by the four fingers that agree; the average half keeps jitter spread over
    every finger from being punished as hard.
    """
    da = np.asarray(a, dtype=np.float64)
    db = np.asarray(b, dtype=np.float64)
    sq = np.sum((da[:SHAPE_DIM] - db[:SHAPE_DIM]).reshape(5, 4, 3) ** 2, axis=2)  # landmarks 1-20 = 5 fingers x 4
    per_finger = np.sqrt(sq.mean(axis=1))
    shape = float(per_finger.mean() + per_finger.max()) / 2
    dy = float(np.linalg.norm(da[SHAPE_DIM : SHAPE_DIM + 3] - db[SHAPE_DIM : SHAPE_DIM + 3]))
    dz = float(np.linalg.norm(da[SHAPE_DIM + 3 :] - db[SHAPE_DIM + 3 :]))
    return shape + POSE_ORIENT_WEIGHT * (dy + dz) / 2


def nearest(sample: np.ndarray, template: np.ndarray) -> float:
    """Distance from one feature vector to the closest row of a (k, 66) template."""
    return min(pose_distance(sample, row) for row in template)


def cross_capture_nn(samples: np.ndarray, groups: Sequence[int]) -> list[float]:
    """For each sample, the distance to its nearest sample from a DIFFERENT capture.

    Measures how repeatable the shape is when the user lowers their hand and makes it again,
    which is what verification has to tolerate (frames within one capture are near copies).
    """
    out: list[float] = []
    for i, s in enumerate(samples):
        others = [samples[j] for j in range(len(samples)) if groups[j] != groups[i]]
        if others:
            out.append(nearest(s, np.stack(others)))
    return out
