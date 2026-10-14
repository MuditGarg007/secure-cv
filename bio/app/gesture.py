"""Hand tracking with MediaPipe Tasks GestureRecognizer: the canned class (for the random prompt)
plus the 3D landmarks of every hand, turned into custom-shape features (handpose.py)."""

from dataclasses import dataclass
from pathlib import Path

import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision

from app.config import (
    GESTURES,
    HAND_DETECTION_MIN,
    HAND_PRESENCE_MIN,
    HAND_TRACKING_MIN,
    MAX_HANDS,
)
from app.handpose import pose_features


@dataclass(frozen=True)
class Hand:
    gesture: str | None  # one of GESTURES, or None when unrecognised
    score: float
    center: tuple[float, float]  # pixels
    features: np.ndarray | None = None  # handpose.pose_features of the world landmarks


class GestureTracker:
    """One recognizer per verify request (VIDEO mode tracks hands across frames and needs
    increasing timestamps, so it can't be shared between concurrent requests)."""

    def __init__(self, model_path: Path):
        opts = vision.GestureRecognizerOptions(
            base_options=BaseOptions(model_asset_path=str(model_path)),
            running_mode=vision.RunningMode.VIDEO,
            num_hands=MAX_HANDS,
            min_hand_detection_confidence=HAND_DETECTION_MIN,
            min_hand_presence_confidence=HAND_PRESENCE_MIN,
            min_tracking_confidence=HAND_TRACKING_MIN,
        )
        self._rec = vision.GestureRecognizer.create_from_options(opts)
        self._last_ts = -1

    def __enter__(self) -> "GestureTracker":
        return self

    def __exit__(self, *exc) -> None:
        self._rec.close()

    def hands(self, rgb: np.ndarray, t_ms: float) -> list[Hand]:
        ts = max(int(t_ms), self._last_ts + 1)
        self._last_ts = ts
        res = self._rec.recognize_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), ts)
        h, w = rgb.shape[:2]
        out: list[Hand] = []
        for cats, lms, world in zip(res.gestures, res.hand_landmarks, res.hand_world_landmarks):
            top = cats[0] if cats else None
            name = top.category_name if top and top.category_name in GESTURES else None
            cx = float(np.mean([p.x for p in lms])) * w
            cy = float(np.mean([p.y for p in lms])) * h
            feats = pose_features(np.array([[p.x, p.y, p.z] for p in world], dtype=np.float32))
            out.append(Hand(gesture=name, score=float(top.score) if name else 0.0, center=(cx, cy), features=feats))
        return out
