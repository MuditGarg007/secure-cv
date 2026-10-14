"""Live custom-gesture calibration on a local webcam (dev tool, needs the models).

    uv run python scripts/calibrate_pose.py [camera_index]

1. Press SPACE three times: each press records one enrollment capture (5 frames) of your shape.
   Lower your hand between presses, like the real enrollment.
2. Then the window shows, live, the distance from whatever hand is in view to your template and
   the per-user threshold tau. Try your own shape, small variations, other people's hands and
   other shapes; record the numbers under docs/biometrics.md#decisions.

Frames stay in memory and are never written. Press q to quit, r to re-enroll.
"""

import sys
import time

import cv2

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))

from app.config import BIO_DIR, GESTURE_ENROLL_CAPTURES, GESTURE_ENROLL_FRAMES_PER_CAPTURE  # noqa: E402
from app.decision import enroll_pose  # noqa: E402
from app.gesture import GestureTracker  # noqa: E402
from app.handpose import nearest  # noqa: E402
from app.pipeline import ENROLL_FRAME_STEP_MS  # noqa: E402


def main() -> None:
    cam = cv2.VideoCapture(int(sys.argv[1]) if len(sys.argv) > 1 else 0)
    model = BIO_DIR / "models" / "gesture_recognizer.task"
    with GestureTracker(model) as tracker:
        t0 = time.monotonic()
        enrolled: list[list] = []
        template = None
        msg = "SPACE: record capture 1"
        while True:
            ok, frame = cam.read()
            if not ok:
                break
            now = (time.monotonic() - t0) * 1000
            hands = tracker.hands(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB), now)
            if template is not None:
                dists = [nearest(h.features, template.samples) for h in hands if h.features is not None]
                if dists:
                    d = min(dists)
                    hit = d <= template.tau
                    msg = f"dist {d:.3f}  tau {template.tau:.3f}  {'MATCH' if hit else 'no match'}"
                else:
                    msg = f"no hand  (tau {template.tau:.3f}, spread {template.spread:.3f})"
            view = cv2.flip(frame, 1)
            cv2.putText(view, msg, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.imshow("calibrate_pose", view)
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            if key == ord("r"):
                enrolled, template, msg = [], None, "SPACE: record capture 1"
            if key == ord(" ") and template is None:
                for _ in range(GESTURE_ENROLL_FRAMES_PER_CAPTURE):
                    time.sleep(ENROLL_FRAME_STEP_MS / 1000)
                    ok, frame = cam.read()
                    now = (time.monotonic() - t0) * 1000
                    hs = tracker.hands(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB), now) if ok else []
                    enrolled.append([h.features for h in hs if h.features is not None])
                n = len(enrolled) // GESTURE_ENROLL_FRAMES_PER_CAPTURE
                if n < GESTURE_ENROLL_CAPTURES:
                    msg = f"SPACE: record capture {n + 1} (lower your hand first)"
                else:
                    out = enroll_pose(enrolled)
                    if out.reason:
                        enrolled, msg = [], f"enroll failed: {out.reason} (spread {out.spread}). SPACE to retry"
                    else:
                        template = out
    cam.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
