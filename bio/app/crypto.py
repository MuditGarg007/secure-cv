"""Biometric template encryption. Blob = base64(nonce(12) | ciphertext | tag(16)), AES-256-GCM,
AAD = userId so a blob copied to another user's row fails to decrypt.

Plaintext (v2) = MAGIC | k (u32) | tau (f32) | face embedding (512 f32) | k pose samples (k x 66 f32),
all little-endian. One blob holds the face and the custom hand shape, so they are always enrolled
together. A v1 blob (bare 512-float face embedding) fails as malformed: re-enroll.

The key lives only in bio (BIO_TEMPLATE_KEY): web stores blobs it cannot read.
"""

import base64
import binascii
import os
import struct
from dataclasses import dataclass

import numpy as np
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import EMBEDDING_DIM, GESTURE_ENROLL_FRAMES
from app.handpose import POSE_FEATURE_DIM

NONCE_LEN = 12
TAG_LEN = 16
MAGIC = b"BT2\0"
HEADER = struct.Struct("<4sIf")


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


@dataclass(frozen=True)
class BioTemplate:
    face: np.ndarray  # (512,) L2-normalized ArcFace embedding
    pose: np.ndarray  # (k, 66) custom hand-shape samples (handpose.pose_features)
    pose_tau: float  # per-user match threshold for the hand shape


def encrypt_template(key: bytes, user_id: str, tpl: BioTemplate) -> str:
    face = np.asarray(tpl.face, dtype="<f4").reshape(-1)
    pose = np.asarray(tpl.pose, dtype="<f4")
    if face.size != EMBEDDING_DIM:
        raise ValueError("embedding has wrong size")
    if pose.ndim != 2 or pose.shape[1] != POSE_FEATURE_DIM or not 1 <= len(pose) <= GESTURE_ENROLL_FRAMES:
        raise ValueError("pose template has wrong shape")
    if not np.isfinite(tpl.pose_tau) or tpl.pose_tau <= 0:
        raise ValueError("bad pose threshold")
    header = HEADER.pack(MAGIC, len(pose), float(tpl.pose_tau))
    return seal(key, user_id, header + face.tobytes() + pose.tobytes())


def decrypt_template(key: bytes, user_id: str, blob: str) -> BioTemplate:
    raw = unseal(key, user_id, blob)
    if len(raw) < HEADER.size:
        raise TemplateError("wrong size")
    magic, k, tau = HEADER.unpack_from(raw)
    if magic != MAGIC or not 1 <= k <= GESTURE_ENROLL_FRAMES or not np.isfinite(tau) or tau <= 0:
        raise TemplateError("unknown template format")
    if len(raw) != HEADER.size + 4 * (EMBEDDING_DIM + k * POSE_FEATURE_DIM):
        raise TemplateError("wrong size")
    vals = np.frombuffer(raw, dtype="<f4", offset=HEADER.size).astype(np.float32)
    return BioTemplate(
        face=vals[:EMBEDDING_DIM],
        pose=vals[EMBEDDING_DIM:].reshape(k, POSE_FEATURE_DIM),
        pose_tau=float(tau),
    )
