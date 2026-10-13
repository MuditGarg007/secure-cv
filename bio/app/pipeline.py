"""Real-mode pipeline: JPEG bytes -> per-frame model results -> pure decision (decision.py).

Frames live only in memory for the duration of the request. Nothing is written or logged.
"""

from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from app.config import ANALYZE_MIN_GAP_MS, DET_MODEL, GESTURE_MODEL, MULTI_FACE_MIN_PX, REC_MODEL
from app.decision import Decision, EnrollFrame, FrameResult, decide, enroll_reason, select_frames
from app.face import Detector, Embedder, Face, align
from app.gesture import GestureTracker, Hand


class Models:
    """Loaded once at startup. onnxruntime sessions are safe to share across requests."""

    def __init__(self, models_dir: Path):
        missing = [n for n in (DET_MODEL, REC_MODEL, GESTURE_MODEL) if not (models_dir / n).exists()]
        if missing:
            raise RuntimeError(f"missing models {missing}: run `uv run python scripts/download_models.py`")
        self.detector = Detector(models_dir / DET_MODEL)
        self.embedder = Embedder(models_dir / REC_MODEL)
        self.gesture_path = models_dir / GESTURE_MODEL
        with GestureTracker(self.gesture_path):
            pass  # fail fast if the task file is broken

    def faces(self, img: np.ndarray) -> list[Face]:
        return [f for f in self.detector.detect(img) if f.width >= MULTI_FACE_MIN_PX]


def decode_jpeg(data: bytes) -> np.ndarray | None:
    """BGR image or None. In memory only."""
    if not data:
        return None
    return cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)


def mean_template(embs: np.ndarray) -> np.ndarray:
    m = embs.mean(axis=0)
    return (m / np.linalg.norm(m)).astype(np.float32)


@dataclass(frozen=True)
class EnrollOutcome:
    reason: str | None
    template: np.ndarray | None


def enroll(models: Models, frames: Sequence[bytes]) -> EnrollOutcome:
    rows: list[EnrollFrame] = []
    crops: list[np.ndarray] = []
    for data in frames:
        img = decode_jpeg(data)
        if img is None:
            return EnrollOutcome("low_quality", None)
        faces = models.faces(img)
        rows.append(EnrollFrame(faces=len(faces), face_px=faces[0].width if len(faces) == 1 else 0.0))
        if len(faces) == 1:
            crops.append(align(img, faces[0].kps))
    embs = models.embedder.embed(crops)
    pair_sims = [float(embs[i] @ embs[j]) for i in range(len(embs)) for j in range(i + 1, len(embs))]
    reason = enroll_reason(rows, pair_sims)
    if reason:
        return EnrollOutcome(reason, None)
    return EnrollOutcome(None, mean_template(embs))


def _face_pass(models: Models, imgs: list[np.ndarray | None]) -> tuple[list[list[Face]], dict[int, np.ndarray]]:
    faces = [models.faces(img) if img is not None else [] for img in imgs]
    idx = [i for i, fs in enumerate(faces) if len(fs) == 1]
    embs = models.embedder.embed([align(imgs[i], faces[i][0].kps) for i in idx])
    return faces, dict(zip(idx, embs))


def _gesture_pass(models: Models, imgs: list[np.ndarray | None], ts: Sequence[float]) -> list[list[Hand]]:
    out: list[list[Hand]] = []
    with GestureTracker(models.gesture_path) as tracker:
        for img, t in zip(imgs, ts):
            out.append(tracker.hands(cv2.cvtColor(img, cv2.COLOR_BGR2RGB), t) if img is not None else [])
    return out


def analyze(
    models: Models, frames: Sequence[bytes], timestamps: Sequence[float], template: np.ndarray
) -> list[FrameResult]:
    imgs = [decode_jpeg(d) for d in frames]
    with ThreadPoolExecutor(max_workers=2) as ex:
        face_job = ex.submit(_face_pass, models, imgs)
        hand_job = ex.submit(_gesture_pass, models, imgs, timestamps)
        faces, embs = face_job.result()
        hands = hand_job.result()

    rows: list[FrameResult] = []
    prev: np.ndarray | None = None
    for i, t in enumerate(timestamps):
        face_sim = prev_sim = hand_dist = None
        emb = embs.get(i)
        if emb is not None:
            face_sim = float(emb @ template)
            prev_sim = float(emb @ prev) if prev is not None else None
            prev = emb
        recognised = [h for h in hands[i] if h.gesture]
        best = max(recognised, key=lambda h: h.score, default=None)
        if best and emb is not None:
            face = faces[i][0]
            cx, cy = face.center
            hand_dist = float(np.hypot(best.center[0] - cx, best.center[1] - cy)) / max(face.width, 1.0)
        rows.append(
            FrameResult(
                t_ms=float(t),
                faces=len(faces[i]),
                face_sim=face_sim,
                prev_sim=prev_sim,
                gesture=best.gesture if best else None,
                gesture_score=best.score if best else 0.0,
                hand_dist=hand_dist,
            )
        )
    return rows


def verify(
    models: Models,
    frames: Sequence[bytes],
    timestamps: Sequence[float],
    template: np.ndarray,
    prompts: Sequence[str],
    *,
    now_ms: float,
    expires_at_ms: float,
) -> Decision:
    picked = select_frames(timestamps, ANALYZE_MIN_GAP_MS)
    rows = analyze(models, [frames[i] for i in picked], [timestamps[i] for i in picked], template)
    return decide(rows, prompts, now_ms=now_ms, expires_at_ms=expires_at_ms, timestamps=timestamps)
