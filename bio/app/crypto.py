"""Face template encryption. Blob = base64(nonce(12) | ciphertext | tag(16)), AES-256-GCM,
AAD = userId so a blob copied to another user's row fails to decrypt.

The key lives only in bio (BIO_TEMPLATE_KEY): web stores blobs it cannot read.
"""

import base64
import binascii
import os

import numpy as np
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import EMBEDDING_DIM

NONCE_LEN = 12
TAG_LEN = 16


class TemplateError(Exception):
    """Blob is malformed, tampered, encrypted for another user or with another key."""


def seal(key: bytes, user_id: str, plaintext: bytes) -> str:
    nonce = os.urandom(NONCE_LEN)
    ct = AESGCM(key).encrypt(nonce, plaintext, user_id.encode())
    return base64.b64encode(nonce + ct).decode()


def unseal(key: bytes, user_id: str, blob: str) -> bytes:
    try:
        raw = base64.b64decode(blob, validate=True)
    except (binascii.Error, ValueError) as e:
        raise TemplateError("not base64") from e
    if len(raw) < NONCE_LEN + TAG_LEN:
        raise TemplateError("too short")
    try:
        return AESGCM(key).decrypt(raw[:NONCE_LEN], raw[NONCE_LEN:], user_id.encode())
    except InvalidTag as e:
        raise TemplateError("authentication failed") from e


def encrypt_template(key: bytes, user_id: str, embedding: np.ndarray) -> str:
    vec = np.asarray(embedding, dtype="<f4").reshape(-1)
    if vec.size != EMBEDDING_DIM:
        raise ValueError("embedding has wrong size")
    return seal(key, user_id, vec.tobytes())


def decrypt_template(key: bytes, user_id: str, blob: str) -> np.ndarray:
    vec = np.frombuffer(unseal(key, user_id, blob), dtype="<f4")
    if vec.size != EMBEDDING_DIM:
        raise TemplateError("wrong size")
    return vec.astype(np.float32)
