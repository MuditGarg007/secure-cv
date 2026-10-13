"""Fetch the model files into bio/models/ (gitignored).

    uv run python scripts/download_models.py

- InsightFace buffalo_l: only det_10g.onnx (SCRFD detector) and w600k_r50.onnx (ArcFace)
  are extracted. The weights are licensed for non-commercial research only.
- MediaPipe gesture_recognizer.task (float16).

Files are checked against pinned sha256 digests. Existing good files are skipped.
"""

import hashlib
import shutil
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

MODELS = Path(__file__).resolve().parent.parent / "models"

BUFFALO_URL = "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip"
GESTURE_URL = (
    "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/"
    "gesture_recognizer/float16/latest/gesture_recognizer.task"
)

SHA256 = {
    "det_10g.onnx": "5838f7fe053675b1c7a08b633df49e7af5495cee0493c7dcf6697200b85b5b91",
    "w600k_r50.onnx": "4c06341c33c2ca1f86781dab0e829f88ad5b64be9fba56e56bc9ebdefc619e43",
    "gesture_recognizer.task": "97952348cf6a6a4915c2ea1496b4b37ebabc50cbbf80571435643c455f2b0482",
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def good(name: str) -> bool:
    p = MODELS / name
    return p.exists() and sha256(p) == SHA256[name]


def download(url: str, dest: Path) -> None:
    print(f"downloading {url}")
    with urllib.request.urlopen(url) as r, dest.open("wb") as f:
        total = int(r.headers.get("content-length") or 0)
        done = 0
        while chunk := r.read(1 << 20):
            f.write(chunk)
            done += len(chunk)
            if total:
                print(f"\r  {done * 100 // total:3d}%  {done >> 20} MB", end="", flush=True)
    print()


def check(name: str) -> None:
    got = sha256(MODELS / name)
    if got != SHA256[name]:
        (MODELS / name).unlink()
        sys.exit(f"sha256 mismatch for {name}: {got}")
    print(f"ok  {name}")


def main() -> None:
    MODELS.mkdir(parents=True, exist_ok=True)
    face = ["det_10g.onnx", "w600k_r50.onnx"]
    if all(good(n) for n in face):
        print("ok  buffalo_l (cached)")
    else:
        with tempfile.TemporaryDirectory() as tmp:
            zpath = Path(tmp) / "buffalo_l.zip"
            download(BUFFALO_URL, zpath)
            with zipfile.ZipFile(zpath) as z:
                for name in face:
                    member = next(m for m in z.namelist() if m.endswith(name))
                    with z.open(member) as src, (MODELS / name).open("wb") as dst:
                        shutil.copyfileobj(src, dst)
                    check(name)
    if good("gesture_recognizer.task"):
        print("ok  gesture_recognizer.task (cached)")
    else:
        download(GESTURE_URL, MODELS / "gesture_recognizer.task")
        check("gesture_recognizer.task")


if __name__ == "__main__":
    main()
