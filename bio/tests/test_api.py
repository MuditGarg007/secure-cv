"""HTTP contract in fake mode, plus the guard that real mode never reads `meta.fake`."""

import base64
import json
import os
from datetime import UTC, datetime, timedelta

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import pipeline
from app.config import DEV_FAKE_TEMPLATE, ENROLL_TOTAL_FRAMES, MAX_FRAME_BYTES, Settings
from app.crypto import decrypt_template, encrypt_template
from app.decision import Decision
from app.fake import fake_template
from app.server import create_app

TOKEN = "test-token-123456"
KEY_B64 = base64.b64encode(os.urandom(32)).decode()
AUTH = {"X-Internal-Token": TOKEN}
JPEG = b"\xff\xd8\xff\xe0fake-jpeg\xff\xd9"
PROMPTS = ["Custom", "Victory"]


def settings(fake: bool) -> Settings:
    return Settings(BIO_INTERNAL_TOKEN=TOKEN, BIO_TEMPLATE_KEY=KEY_B64, BIO_FAKE=fake, _env_file=None)


@pytest.fixture
def client():
    with TestClient(create_app(settings(fake=True))) as c:
        yield c


def files(meta: dict, n: int, frame: bytes = JPEG) -> list:
    out = [("meta", (None, json.dumps(meta)))]
    out += [(f"frame_{i:03d}", (f"frame_{i:03d}.jpg", frame, "image/jpeg")) for i in range(n)]
    return out


def verify_meta(template: str, **kw) -> dict:
    n = kw.pop("n", 10)
    meta = {
        "userId": "user-a",
        "templateEnc": template,
        "prompts": PROMPTS,
        "expiresAt": (datetime.now(UTC) + timedelta(minutes=2)).isoformat(),
        "timestamps": [i * 100 for i in range(n)],
    }
    meta.update(kw)
    return meta


def enroll(client, user="user-a", fake=None) -> dict:
    meta = {"userId": user} | ({"fake": fake} if fake else {})
    r = client.post("/enroll", headers=AUTH, files=files(meta, ENROLL_TOTAL_FRAMES))
    assert r.status_code == 200, r.text
    return r.json()


# ---- token ----
@pytest.mark.parametrize("headers", [{}, {"X-Internal-Token": "wrong-token-000"}])
def test_every_route_needs_token(client, headers):
    assert client.get("/healthz", headers=headers).status_code == 401
    assert client.post("/enroll", headers=headers, files=files({"userId": "u"}, 5)).status_code == 401
    assert client.post("/verify", headers=headers, files=files({}, 1)).status_code == 401


def test_healthz(client):
    r = client.get("/healthz", headers=AUTH)
    assert r.json() == {"ok": True, "fake": True}


def test_no_docs_exposed(client):
    assert client.get("/docs", headers=AUTH).status_code == 404
    assert client.get("/openapi.json", headers=AUTH).status_code == 404


# ---- enroll ----
def test_fake_enroll_returns_real_encrypted_template(client):
    body = enroll(client)
    assert body["ok"] is True
    tpl = decrypt_template(base64.b64decode(KEY_B64), "user-a", body["templateEnc"])
    assert tpl.face.shape == (512,)
    assert np.isclose(np.linalg.norm(tpl.face), 1.0, atol=1e-5)
    assert tpl.pose.shape[0] > 0
    assert tpl.pose_tau > 0


@pytest.mark.parametrize("reason", ["no_face", "gesture_unstable", "no_hand"])
def test_fake_enroll_failure(client, reason):
    assert enroll(client, fake=f"fail:{reason}") == {"ok": False, "reason": reason}


@pytest.mark.parametrize("n", [5, ENROLL_TOTAL_FRAMES - 1, ENROLL_TOTAL_FRAMES + 1])
def test_enroll_needs_face_and_gesture_frames(client, n):
    r = client.post("/enroll", headers=AUTH, files=files({"userId": "u"}, n))
    assert r.status_code == 400


def test_enroll_rejects_unknown_fake_reason(client):
    r = client.post("/enroll", headers=AUTH, files=files({"userId": "u", "fake": "fail:bogus"}, ENROLL_TOTAL_FRAMES))
    assert r.status_code == 400


# ---- verify ----
def test_fake_verify_pass(client):
    tpl = enroll(client)["templateEnc"]
    r = client.post("/verify", headers=AUTH, files=files(verify_meta(tpl, fake="pass"), 10))
    assert r.status_code == 200
    assert r.json()["passed"] is True
    assert r.json()["reasons"] == []


def test_fake_verify_defaults_to_pass(client):
    tpl = enroll(client)["templateEnc"]
    r = client.post("/verify", headers=AUTH, files=files(verify_meta(tpl), 10))
    assert r.json()["passed"] is True


def test_fake_verify_fail_reason(client):
    tpl = enroll(client)["templateEnc"]
    r = client.post("/verify", headers=AUTH, files=files(verify_meta(tpl, fake="fail:prompt_missing"), 10))
    assert r.json() == {"passed": False, "reasons": ["prompt_missing"], "scores": {"fake": True}}


def test_fake_verify_gesture_mismatch(client):
    tpl = enroll(client)["templateEnc"]
    r = client.post("/verify", headers=AUTH, files=files(verify_meta(tpl, fake="fail:gesture_mismatch"), 10))
    assert r.json()["reasons"] == ["gesture_mismatch"]


def test_fake_verify_accepts_dev_placeholder(client):
    r = client.post("/verify", headers=AUTH, files=files(verify_meta(DEV_FAKE_TEMPLATE), 10))
    assert r.json()["passed"] is True


def test_template_of_other_user_rejected(client):
    tpl = enroll(client, user="user-b")["templateEnc"]
    r = client.post("/verify", headers=AUTH, files=files(verify_meta(tpl), 10))
    assert r.json()["passed"] is False
    assert r.json()["reasons"] == ["template_invalid"]


def test_expired_challenge_fails_timing(client):
    tpl = enroll(client)["templateEnc"]
    past = (datetime.now(UTC) - timedelta(seconds=1)).isoformat()
    r = client.post("/verify", headers=AUTH, files=files(verify_meta(tpl, expiresAt=past), 10))
    assert r.json()["passed"] is False
    assert "timing" in r.json()["reasons"]


@pytest.mark.parametrize(
    "change",
    [
        {"timestamps": [0, 100]},  # count mismatch
        {"prompts": ["Wave"]},  # not a canned gesture nor the custom one
        {"prompts": []},
        {"expiresAt": "2030-01-01T00:00:00"},  # no timezone
        {"extra": 1},
        {"fake": "fail:bogus"},
    ],
)
def test_verify_rejects_bad_meta(client, change):
    r = client.post("/verify", headers=AUTH, files=files(verify_meta(DEV_FAKE_TEMPLATE, **change), 10))
    assert r.status_code == 400
    assert "Wave" not in r.text  # input is never echoed back


def test_verify_rejects_non_contiguous_frames(client):
    parts = files(verify_meta(DEV_FAKE_TEMPLATE, n=2), 0)
    parts += [(name, (name + ".jpg", JPEG, "image/jpeg")) for name in ("frame_000", "frame_002")]
    assert client.post("/verify", headers=AUTH, files=parts).status_code == 400


def test_verify_rejects_unknown_part(client):
    parts = files(verify_meta(DEV_FAKE_TEMPLATE, n=1), 1) + [("other", (None, "x"))]
    assert client.post("/verify", headers=AUTH, files=parts).status_code == 400


def test_verify_rejects_missing_meta(client):
    parts = files({}, 1)[1:]
    assert client.post("/verify", headers=AUTH, files=parts).status_code == 400


def test_verify_rejects_oversized_frame(client):
    big = b"\xff" * (MAX_FRAME_BYTES + 1)
    r = client.post("/verify", headers=AUTH, files=files(verify_meta(DEV_FAKE_TEMPLATE, n=1), 1, frame=big))
    assert r.status_code == 413


def test_verify_rejects_too_many_frames(client):
    r = client.post("/verify", headers=AUTH, files=files(verify_meta(DEV_FAKE_TEMPLATE, n=81), 81))
    assert r.status_code == 400


def test_verify_requires_multipart(client):
    assert client.post("/verify", headers=AUTH, json={"userId": "u"}).status_code == 400


# ---- real mode ignores meta.fake (a browser can never steer a real decision) ----
def test_real_mode_ignores_fake_field(monkeypatch):
    seen = {}

    def fake_pipeline_verify(models, frames, timestamps, template, prompts, *, now_ms, expires_at_ms):
        seen["prompts"] = prompts
        return Decision(passed=False, reasons=["no_face"], scores={"presence": 0.0})

    monkeypatch.setattr(pipeline, "verify", fake_pipeline_verify)
    with TestClient(create_app(settings(fake=False), models=object())) as c:
        assert c.get("/healthz", headers=AUTH).json() == {"ok": True, "fake": False}
        tpl = encrypt_template(base64.b64decode(KEY_B64), "user-a", fake_template())
        r = c.post("/verify", headers=AUTH, files=files(verify_meta(tpl, fake="pass"), 10))
        assert r.json()["passed"] is False
        assert seen["prompts"] == PROMPTS
        # dev placeholder is not a template in real mode
        r = c.post("/verify", headers=AUTH, files=files(verify_meta(DEV_FAKE_TEMPLATE), 10))
        assert r.json()["reasons"] == ["template_invalid"]
