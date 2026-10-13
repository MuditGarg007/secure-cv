import base64
import os

import numpy as np
import pytest

from app.crypto import NONCE_LEN, TAG_LEN, TemplateError, decrypt_template, encrypt_template, seal, unseal

KEY = os.urandom(32)


def unit(seed: int = 0) -> np.ndarray:
    v = np.random.default_rng(seed).standard_normal(512).astype(np.float32)
    return v / np.linalg.norm(v)


def test_round_trip():
    v = unit()
    blob = encrypt_template(KEY, "user-a", v)
    assert np.array_equal(decrypt_template(KEY, "user-a", blob), v)


def test_blob_layout_is_nonce_ct_tag():
    raw = base64.b64decode(encrypt_template(KEY, "user-a", unit()))
    assert len(raw) == NONCE_LEN + 512 * 4 + TAG_LEN


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
    with pytest.raises(ValueError):
        encrypt_template(KEY, "u", np.zeros(128, dtype=np.float32))
