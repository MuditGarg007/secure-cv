"""BIO_FAKE=1: no models. `meta.fake` decides: "pass" (default) or "fail:<reason>".
For development and tests only; real mode never reads `meta.fake`.
"""

import numpy as np
from fastapi import HTTPException

from app.config import EMBEDDING_DIM


def parse_fake(value: str | None, allowed_reasons: tuple[str, ...]) -> str | None:
    """None to pass, else the failure reason. Unknown values are a 400."""
    if value is None or value == "pass":
        return None
    if value.startswith("fail:") and value[5:] in allowed_reasons:
        return value[5:]
    raise HTTPException(400, "invalid fake value")


def fake_template() -> np.ndarray:
    """Random unit vector, so fake enrollments still go through the real crypto path."""
    v = np.random.default_rng().standard_normal(EMBEDDING_DIM).astype(np.float32)
    return v / np.linalg.norm(v)
