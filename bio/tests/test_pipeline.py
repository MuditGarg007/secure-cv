"""Smoke test of the real models (skipped until scripts/download_models.py has run)."""

import cv2
import numpy as np
import pytest

from app.config import BIO_DIR, DET_MODEL, GESTURE_MODEL, REC_MODEL

MODELS = BIO_DIR / "models"
pytestmark = pytest.mark.skipif(
    not all((MODELS / n).exists() for n in (DET_MODEL, REC_MODEL, GESTURE_MODEL)),
    reason="models not downloaded",
)


@pytest.fixture(scope="module")
def models():
    from app.pipeline import Models

    return Models(MODELS)


def jpeg(img: np.ndarray) -> bytes:
    return cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 70])[1].tobytes()


BLANK = jpeg(np.full((480, 640, 3), 90, dtype=np.uint8))


def test_enroll_without_a_face(models):
    from app.pipeline import enroll

    assert enroll(models, [BLANK] * 5).reason == "no_face"


def test_enroll_rejects_undecodable_frames(models):
    from app.pipeline import enroll

    assert enroll(models, [b"not a jpeg"] * 5).reason == "low_quality"


def test_verify_without_a_face(models):
    from app.pipeline import verify

    template = np.ones(512, dtype=np.float32) / np.sqrt(512)
    d = verify(
        models,
        [BLANK] * 20,
        [i * 100 for i in range(20)],
        template,
        ["Victory", "Thumb_Up", "Open_Palm"],
        now_ms=0,
        expires_at_ms=1,
    )
    assert not d.passed
    assert {"no_face", "prompt_missing"} <= set(d.reasons)
    assert d.scores["frames"] == 11  # ~5 fps of the 10 fps upload, plus the last frame
