"""bio HTTP API (docs/biometrics.md#bio-api). Only web calls it, with X-Internal-Token.

Responses carry scores for web's auth_events; web strips them before anything reaches a
browser (AGENTS.md rule 9). Frames are never logged or written anywhere.
"""

import hmac
import logging
import time
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, Annotated, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from app.config import (
    DEV_FAKE_TEMPLATE,
    ENROLL_FRAMES,
    GESTURES,
    MAX_PROMPTS,
    MAX_VERIFY_FRAMES,
    Settings,
)
from app.crypto import TemplateError, decrypt_template, encrypt_template
from app.decision import ENROLL_REASONS, TEMPLATE_INVALID, VERIFY_REASONS
from app.fake import fake_template, parse_fake
from app.upload import read_upload

if TYPE_CHECKING:
    from app.pipeline import Models

log = logging.getLogger("uvicorn.error")

Gesture = Literal[GESTURES]  # type: ignore[valid-type]
Timestamp = Annotated[float, Field(allow_inf_nan=False)]


class EnrollMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")
    userId: str = Field(min_length=1, max_length=64)
    fake: str | None = Field(default=None, max_length=40)


class VerifyMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")
    userId: str = Field(min_length=1, max_length=64)
    templateEnc: str = Field(min_length=1, max_length=8_000)
    prompts: list[Gesture] = Field(min_length=1, max_length=MAX_PROMPTS)
    expiresAt: AwareDatetime
    timestamps: list[Timestamp] = Field(min_length=1, max_length=MAX_VERIFY_FRAMES)
    fake: str | None = Field(default=None, max_length=40)


def create_app(settings: Settings | None = None, models: "Models | None" = None) -> FastAPI:
    settings = settings or Settings()  # type: ignore[call-arg]  (from env / bio/.env)
    key = settings.template_key
    token = settings.BIO_INTERNAL_TOKEN.encode()
    state: dict[str, Models | None] = {"models": models}

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        if not settings.BIO_FAKE and state["models"] is None:
            from app.pipeline import Models  # lazy: fake mode and tests never load onnx/mediapipe

            state["models"] = Models(settings.BIO_MODELS_DIR)
        log.info("bio ready, mode=%s", "fake" if settings.BIO_FAKE else "real")
        yield

    def check_token(x_internal_token: Annotated[str | None, Header()] = None) -> None:
        if not x_internal_token or not hmac.compare_digest(x_internal_token.encode(), token):
            raise HTTPException(401, "bad internal token")

    app = FastAPI(
        title="bio",
        lifespan=lifespan,
        dependencies=[Depends(check_token)],  # every route, /healthz included
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )

    def get_models() -> "Models":
        m = state["models"]
        if m is None:
            raise HTTPException(503, "models not loaded")
        return m

    @app.get("/healthz")
    def healthz() -> dict:
        return {"ok": True, "fake": settings.BIO_FAKE}

    @app.post("/enroll")
    async def enroll(request: Request) -> dict:
        meta, frames = await read_upload(request, EnrollMeta, max_frames=ENROLL_FRAMES)
        if len(frames) != ENROLL_FRAMES:
            raise HTTPException(400, f"need exactly {ENROLL_FRAMES} frames")
        if settings.BIO_FAKE:
            reason = parse_fake(meta.fake, ENROLL_REASONS)
            template = None if reason else fake_template()
        else:
            from app import pipeline

            out = await run_in_threadpool(pipeline.enroll, get_models(), frames)
            reason, template = out.reason, out.template
        log.info("enroll ok=%s reason=%s", reason is None, reason)
        if reason or template is None:
            return {"ok": False, "reason": reason}
        return {"ok": True, "templateEnc": encrypt_template(key, meta.userId, template)}

    @app.post("/verify")
    async def verify(request: Request) -> dict:
        now_ms = time.time() * 1000  # receipt time: "received before challenge expiry"
        started = time.perf_counter()
        meta, frames = await read_upload(request, VerifyMeta, max_frames=MAX_VERIFY_FRAMES)
        if len(meta.timestamps) != len(frames):
            raise HTTPException(400, "one timestamp per frame")
        expires_ms = meta.expiresAt.timestamp() * 1000

        if settings.BIO_FAKE:
            result = _fake_verify(key, meta, now_ms=now_ms, expires_ms=expires_ms)
        else:
            from app import pipeline

            try:
                template = decrypt_template(key, meta.userId, meta.templateEnc)
            except TemplateError:
                result = {"passed": False, "reasons": [TEMPLATE_INVALID], "scores": {}}
            else:
                decision = await run_in_threadpool(
                    pipeline.verify,
                    get_models(),
                    frames,
                    meta.timestamps,
                    template,
                    meta.prompts,
                    now_ms=now_ms,
                    expires_at_ms=expires_ms,
                )
                result = decision.to_json()
        log.info(
            "verify passed=%s reasons=%s frames=%d took=%.2fs",
            result["passed"],
            result["reasons"],
            len(frames),
            time.perf_counter() - started,
        )
        return result

    return app


def _fake_verify(key: bytes, meta: VerifyMeta, *, now_ms: float, expires_ms: float) -> dict:
    if meta.templateEnc != DEV_FAKE_TEMPLATE:  # dev-session placeholder can't be decrypted
        try:
            decrypt_template(key, meta.userId, meta.templateEnc)
        except TemplateError:
            return {"passed": False, "reasons": [TEMPLATE_INVALID], "scores": {}}
    reason = parse_fake(meta.fake, VERIFY_REASONS)
    reasons = [reason] if reason else []
    if now_ms > expires_ms and "timing" not in reasons:
        reasons.append("timing")
    return {"passed": not reasons, "reasons": reasons, "scores": {"fake": True}}
