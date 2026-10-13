"""Face detection (SCRFD) + embedding (ArcFace) from InsightFace buffalo_l, run directly on
onnxruntime + numpy instead of the `insightface` pip package (no Cython build, fewer deps).
Pre/post-processing follows insightface's scrfd.py / arcface_onnx.py / face_align.py.
"""

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

from app.config import DET_INPUT_SIZE, DET_NMS_IOU, DET_SCORE_MIN

# ArcFace 112x112 reference positions of eyes, nose tip, mouth corners.
ARCFACE_DST = np.array(
    [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]],
    dtype=np.float32,
)


@dataclass(frozen=True)
class Face:
    bbox: np.ndarray  # x1, y1, x2, y2 in image pixels
    score: float
    kps: np.ndarray  # 5 x 2 landmarks

    @property
    def width(self) -> float:
        return float(self.bbox[2] - self.bbox[0])

    @property
    def center(self) -> tuple[float, float]:
        return float(self.bbox[0] + self.bbox[2]) / 2, float(self.bbox[1] + self.bbox[3]) / 2


def _session(path: Path) -> ort.InferenceSession:
    opts = ort.SessionOptions()
    opts.log_severity_level = 3
    return ort.InferenceSession(str(path), sess_options=opts, providers=["CPUExecutionProvider"])


class Detector:
    """SCRFD-10GF with 5 keypoints: strides 8/16/32, 2 anchors per location."""

    strides = (8, 16, 32)
    num_anchors = 2

    def __init__(self, path: Path, input_size: tuple[int, int] = DET_INPUT_SIZE):
        self.session = _session(path)
        self.input_name = self.session.get_inputs()[0].name
        self.output_names = [o.name for o in self.session.get_outputs()]
        if len(self.output_names) != 9:
            raise RuntimeError("expected SCRFD with keypoints (9 outputs)")
        self.input_size = input_size
        self._centers: dict[tuple[int, int, int], np.ndarray] = {}

    def _anchor_centers(self, h: int, w: int, stride: int) -> np.ndarray:
        key = (h, w, stride)
        if key not in self._centers:
            c = np.stack(np.mgrid[:h, :w][::-1], axis=-1).astype(np.float32)
            c = (c * stride).reshape(-1, 2)
            self._centers[key] = np.stack([c] * self.num_anchors, axis=1).reshape(-1, 2)
        return self._centers[key]

    def detect(self, img: np.ndarray, thresh: float = DET_SCORE_MIN) -> list[Face]:
        """All faces in a BGR image, best first."""
        iw, ih = self.input_size
        h, w = img.shape[:2]
        if h / w > ih / iw:
            new_h, new_w = ih, int(ih * w / h)
        else:
            new_w, new_h = iw, int(iw * h / w)
        scale = new_h / h
        canvas = np.zeros((ih, iw, 3), dtype=np.uint8)
        canvas[:new_h, :new_w] = cv2.resize(img, (new_w, new_h))
        blob = cv2.dnn.blobFromImage(canvas, 1.0 / 128, (iw, ih), (127.5, 127.5, 127.5), swapRB=True)
        outs = self.session.run(self.output_names, {self.input_name: blob})

        scores_l, boxes_l, kps_l = [], [], []
        for i, stride in enumerate(self.strides):
            scores = outs[i].reshape(-1)
            centers = self._anchor_centers(ih // stride, iw // stride, stride)
            keep = np.where(scores >= thresh)[0]
            if keep.size == 0:
                continue
            d = outs[i + 3][keep] * stride
            c = centers[keep]
            boxes_l.append(np.stack([c[:, 0] - d[:, 0], c[:, 1] - d[:, 1], c[:, 0] + d[:, 2], c[:, 1] + d[:, 3]], -1))
            k = outs[i + 6][keep] * stride
            kps_l.append((k.reshape(-1, 5, 2) + c[:, None, :]))
            scores_l.append(scores[keep])
        if not scores_l:
            return []
        scores = np.concatenate(scores_l)
        boxes = np.concatenate(boxes_l) / scale
        kpss = np.concatenate(kps_l) / scale
        order = scores.argsort()[::-1]
        keep = _nms(boxes[order], scores[order], DET_NMS_IOU)
        idx = order[keep]
        return [Face(bbox=boxes[j], score=float(scores[j]), kps=kpss[j]) for j in idx]


def _nms(boxes: np.ndarray, scores: np.ndarray, iou: float) -> list[int]:
    """Greedy NMS over boxes already sorted by score (desc)."""
    x1, y1, x2, y2 = boxes.T
    areas = (x2 - x1 + 1) * (y2 - y1 + 1)
    order = np.arange(len(scores))
    keep: list[int] = []
    while order.size:
        i = order[0]
        keep.append(int(i))
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        inter = np.maximum(0.0, xx2 - xx1 + 1) * np.maximum(0.0, yy2 - yy1 + 1)
        ovr = inter / (areas[i] + areas[order[1:]] - inter)
        order = order[1:][ovr <= iou]
    return keep


def _similarity_transform(src: np.ndarray, dst: np.ndarray) -> np.ndarray:
    """2x3 least-squares similarity transform src -> dst (Umeyama, as skimage does)."""
    n = src.shape[0]
    src_mean, dst_mean = src.mean(0), dst.mean(0)
    src_d, dst_d = src - src_mean, dst - dst_mean
    a = dst_d.T @ src_d / n
    d = np.ones(2)
    if np.linalg.det(a) < 0:
        d[1] = -1
    u, s, vt = np.linalg.svd(a)
    r = u @ np.diag(d) @ vt
    scale = (s @ d) / src_d.var(axis=0).sum()
    t = dst_mean - scale * (r @ src_mean)
    return np.hstack([scale * r, t[:, None]]).astype(np.float32)


def align(img: np.ndarray, kps: np.ndarray) -> np.ndarray:
    """112x112 ArcFace crop from the 5 landmarks."""
    m = _similarity_transform(kps.astype(np.float32), ARCFACE_DST)
    return cv2.warpAffine(img, m, (112, 112), borderValue=0.0)


class Embedder:
    """ArcFace R50 (w600k): aligned 112x112 BGR crops -> L2-normalised 512-d embeddings."""

    def __init__(self, path: Path):
        self.session = _session(path)
        self.input_name = self.session.get_inputs()[0].name
        self.output_name = self.session.get_outputs()[0].name

    def embed(self, crops: list[np.ndarray]) -> np.ndarray:
        if not crops:
            return np.zeros((0, 512), dtype=np.float32)
        blob = cv2.dnn.blobFromImages(crops, 1.0 / 127.5, (112, 112), (127.5, 127.5, 127.5), swapRB=True)
        out = self.session.run([self.output_name], {self.input_name: blob})[0]
        return out / np.linalg.norm(out, axis=1, keepdims=True)
