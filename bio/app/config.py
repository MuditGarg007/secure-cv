"""All bio tunables (AGENTS.md rule 10). Thresholds are constants; secrets come from env.

Calibration results are recorded in docs/biometrics.md#decisions.
"""

import base64
import binascii
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BIO_DIR = Path(__file__).resolve().parent.parent

# ---- gestures (MediaPipe GestureRecognizer canned classes; same list as web config.ts) ----
GESTURES = (
    "Closed_Fist",
    "Open_Palm",
    "Pointing_Up",
    "Thumb_Up",
    "Thumb_Down",
    "Victory",
    "ILoveYou",
)

# ---- verify decision (docs/biometrics.md#verify-decision-bio) ----
FACE_SIM_THRESHOLD = 0.45  # median cosine similarity to the enrolled template
FACE_PRESENCE_MIN = 0.8  # share of frames with exactly one face
CONTINUITY_MIN = 0.6  # cosine similarity between consecutive face embeddings
GESTURE_SCORE_MIN = 0.6
GESTURE_HOLD_MS = 300  # each prompt held at least this long
GESTURE_MAX_GAP_MS = 450  # a hold survives one dropped/misread analysed frame (~5 fps)
HAND_FACE_MAX_DIST = 3.0  # hand centre within this many face widths of the face centre
CAPTURE_WINDOW_MS = 8_000  # same as web LIVENESS_CAPTURE_WINDOW_MS
TIMING_SLACK_MS = 1_000  # frame span may exceed the window by this much (timer jitter)
ANALYZE_MIN_GAP_MS = 180  # browser sends ~10 fps; bio analyses frames >= this far apart (~5 fps)

# ---- enrollment ----
ENROLL_FRAMES = 5
ENROLL_MIN_FACE_PX = 100  # face bbox width
ENROLL_CONSISTENCY_MIN = 0.6  # every enrollment frame must look like the same person

# ---- input limits ----
MAX_VERIFY_FRAMES = 80
MAX_FRAME_BYTES = 300_000
MAX_META_BYTES = 20_000
MAX_PROMPTS = 10

# ---- face models (InsightFace buffalo_l run directly on onnxruntime) ----
DET_MODEL = "det_10g.onnx"  # SCRFD-10GF
REC_MODEL = "w600k_r50.onnx"  # ArcFace R50, 512-d
GESTURE_MODEL = "gesture_recognizer.task"
DET_INPUT_SIZE = (480, 352)  # (w, h), multiples of 32; 640x480 frames are scaled to fit
DET_SCORE_MIN = 0.5
DET_NMS_IOU = 0.4
MULTI_FACE_MIN_PX = 40  # smaller detections are ignored (background noise)
EMBEDDING_DIM = 512

# ---- MediaPipe gesture recognizer ----
HAND_DETECTION_MIN = 0.5
HAND_PRESENCE_MIN = 0.5
HAND_TRACKING_MIN = 0.5
MAX_HANDS = 2

# ---- fake mode / dev ----
# Placeholder written by `pnpm dev:session --face`; only accepted in fake mode.
DEV_FAKE_TEMPLATE = "DEV-FAKE-TEMPLATE"


class Settings(BaseSettings):
    """Env (bio/.env). Fails fast on startup if something is missing."""

    model_config = SettingsConfigDict(env_file=BIO_DIR / ".env", extra="ignore")

    BIO_INTERNAL_TOKEN: str = Field(min_length=8)
    BIO_TEMPLATE_KEY: str  # base64 of 32 random bytes (AES-256-GCM)
    BIO_FAKE: bool = False
    BIO_MODELS_DIR: Path = BIO_DIR / "models"

    @field_validator("BIO_TEMPLATE_KEY")
    @classmethod
    def _key_is_32_bytes(cls, v: str) -> str:
        try:
            raw = base64.b64decode(v, validate=True)
        except (binascii.Error, ValueError) as e:
            raise ValueError("BIO_TEMPLATE_KEY must be base64") from e
        if len(raw) != 32:
            raise ValueError("BIO_TEMPLATE_KEY must decode to 32 bytes")
        return v

    @property
    def template_key(self) -> bytes:
        return base64.b64decode(self.BIO_TEMPLATE_KEY)
