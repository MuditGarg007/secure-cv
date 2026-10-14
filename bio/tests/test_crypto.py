import base64
import os

import numpy as np
import pytest

from app.crypto import (
    HEADER,
    NONCE_LEN,
    TAG_LEN,
    BioTemplate,
    TemplateError,
    decrypt_template,
    encrypt_template,
    seal,
    unseal,
)
from app.handpose import POSE_FEATURE_DIM

KEY = os.urandom(32)


def unit(seed: int = 0, k: int = 12) -> BioTemplate:
    rng = np.random.default_rng(seed)
    v = rng.standard_normal(512).astype(np.float32)
    pose = rng.standard_normal((k, POSE_FEATURE_DIM)).astype(np.float32)
    return BioTemplate(face=v / np.linalg.norm(v), pose=pose, pose_tau=0.25)


def test_round_trip():
    t = unit()
    out = decrypt_template(KEY, "user-a", encrypt_template(KEY, "user-a", t))
    assert np.array_equal(out.face, t.face)
    assert np.array_equal(out.pose, t.pose)
    assert out.pose_tau == pytest.approx(0.25)


def test_blob_layout_is_nonce_ct_tag():
    raw = base64.b64decode(encrypt_template(KEY, "user-a", unit(k=12)))
    assert len(raw) == NONCE_LEN + HEADER.size + (512 + 12 * POSE_FEATURE_DIM) * 4 + TAG_LEN


def test_v1_face_only_blob_rejected():
    with pytest.raises(TemplateError):
        decrypt_template(KEY, "u", seal(KEY, "u", np.zeros(512, dtype="<f4").tobytes()))


def test_fresh_nonce_each_time():
    v = unit()
    assert encrypt_template(KEY, "u", v) != encrypt_template(KEY, "u", v)


def test_wrong_user_fails():
    blob = encrypt_template(KEY, "user-a", unit())
    with pytest.raises(TemplateError):
        decrypt_template(KEY, "user-b", blob)


def test_wrong_key_fails():
    blob = encrypt_template(KEY, "user-a", unit())
    with pytest.raises(TemplateError):
        decrypt_template(os.urandom(32), "user-a", blob)


@pytest.mark.parametrize("pos", [0, NONCE_LEN + 5, -1])  # nonce, ciphertext, tag
def test_tamper_fails(pos):
    raw = bytearray(base64.b64decode(encrypt_template(KEY, "user-a", unit())))
    raw[pos] ^= 0x01
    with pytest.raises(TemplateError):
        decrypt_template(KEY, "user-a", base64.b64encode(raw).decode())


@pytest.mark.parametrize("blob", ["", "not base64!", base64.b64encode(b"short").decode(), "DEV-FAKE-TEMPLATE"])
def test_garbage_fails(blob):
    with pytest.raises(TemplateError):
        decrypt_template(KEY, "user-a", blob)


def test_wrong_plaintext_size_fails():
    with pytest.raises(TemplateError):
        decrypt_template(KEY, "u", seal(KEY, "u", b"\0" * 12))


def test_seal_unseal_bytes():
    assert unseal(KEY, "u", seal(KEY, "u", b"hello")) == b"hello"


def test_encrypt_rejects_wrong_dim():
    t = unit()
    with pytest.raises(ValueError):
        encrypt_template(KEY, "u", BioTemplate(face=np.zeros(128, dtype=np.float32), pose=t.pose, pose_tau=0.2))
    with pytest.raises(ValueError):
        encrypt_template(KEY, "u", BioTemplate(face=t.face, pose=np.zeros((3, 10), dtype=np.float32), pose_tau=0.2))
    with pytest.raises(ValueError):
        encrypt_template(KEY, "u", BioTemplate(face=t.face, pose=t.pose, pose_tau=0.0))


def test_header_with_wrong_count_rejected():
    t = unit(k=4)
    body = t.face.astype("<f4").tobytes() + t.pose.astype("<f4").tobytes()
    with pytest.raises(TemplateError):
        decrypt_template(KEY, "u", seal(KEY, "u", HEADER.pack(b"BT2\0", 5, 0.2) + body))
