// Browser camera capture for liveness + enrollment (docs/biometrics.md#capture-browser).
// Pure helpers at the top (unit tested, also used by the server to read uploads); browser-only
// functions below touch navigator/document only when called.
import {
  CAPTURE_FPS,
  CAPTURE_HEIGHT,
  CAPTURE_JPEG_QUALITY,
  CAPTURE_WIDTH,
  MAX_FRAME_BYTES,
  MAX_LIVENESS_FRAMES,
} from "@/server/config";

export type CapturedFrame = { blob: Blob; t: number };

/** Multipart field name of frame i: frame_000, frame_001, ... */
export function frameFieldName(i: number): string {
  return `frame_${String(i).padStart(3, "0")}`;
}

export const FRAME_FIELD_RE = /^frame_\d{3}$/;

/** `meta` JSON + frame_000.jpg ... in order. */
export function buildFrameForm(meta: Record<string, unknown>, frames: readonly Blob[]): FormData {
  const form = new FormData();
  form.append("meta", JSON.stringify(meta));
  frames.forEach((f, i) => form.append(frameFieldName(i), f, `${frameFieldName(i)}.jpg`));
  return form;
}

/** Offsets (ms from capture start) at which to grab frames: every 1000/fps inside the window. */
export function captureSchedule(fps: number, durationMs: number, maxFrames: number): number[] {
  const step = 1000 / fps;
  const out: number[] = [];
  for (let k = 0; k < maxFrames && k * step < durationMs; k++) out.push(Math.round(k * step));
  return out;
}

/** performance.now() values → ms relative to the first frame, whole numbers, strictly increasing. */
export function relativeTimestamps(abs: readonly number[]): number[] {
  const out: number[] = [];
  for (const a of abs) {
    const t = Math.round(a - abs[0]);
    out.push(out.length && t <= out[out.length - 1] ? out[out.length - 1] + 1 : t);
  }
  return out;
}

/** Fit (w, h) inside the capture size, keeping the aspect ratio. */
export function fitSize(w: number, h: number, maxW = CAPTURE_WIDTH, maxH = CAPTURE_HEIGHT) {
  const s = Math.min(1, maxW / w, maxH / h);
  return { width: Math.round(w * s), height: Math.round(h * s) };
}

// ---------------------------------------------------------------- browser only

export type CameraErrorKind = "denied" | "no_camera" | "unsupported" | "failed";

export class CameraError extends Error {
  constructor(public kind: CameraErrorKind) {
    super(kind);
  }
}

/** Front camera, 640x480 preferred. Throws CameraError. */
export async function openCamera(): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new CameraError("unsupported");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: CAPTURE_WIDTH }, height: { ideal: CAPTURE_HEIGHT } },
      audio: false,
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") throw new CameraError("denied");
    if (name === "NotFoundError" || name === "OverconstrainedError") throw new CameraError("no_camera");
    throw new CameraError("failed");
  }
}

/**
 * Stand-in video for BIO_FAKE dev runs on machines without a camera: an animated test card.
 * Never used in real mode (the UI only offers it when bio reports fake mode).
 */
export function syntheticStream(): MediaStream {
  const canvas = document.createElement("canvas");
  canvas.width = CAPTURE_WIDTH;
  canvas.height = CAPTURE_HEIGHT;
  const ctx = canvas.getContext("2d")!;
  const stream = canvas.captureStream(CAPTURE_FPS);
  const track = stream.getVideoTracks()[0];
  const start = performance.now();
  const draw = () => {
    if (track.readyState === "ended") return; // stopStream() ends the animation too
    ctx.fillStyle = "#334155";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "28px sans-serif";
    ctx.fillText("Fake camera (BIO_FAKE)", 40, 80);
    ctx.fillText(`${((performance.now() - start) / 1000).toFixed(1)} s`, 40, 130);
    requestAnimationFrame(draw);
  };
  draw();
  return stream;
}

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop());
}

/** One JPEG of the current video frame (unmirrored), or null if the video has no frame yet. */
export function grabJpeg(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  quality = CAPTURE_JPEG_QUALITY,
): Promise<Blob | null> {
  if (!video.videoWidth || !video.videoHeight) return Promise.resolve(null);
  const { width, height } = fitSize(video.videoWidth, video.videoHeight);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  canvas.getContext("2d")!.drawImage(video, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Grab JPEG frames at `fps` for `durationMs` (max `maxFrames`). Timestamps are performance.now()
 * relative to the first frame. Frames stay in memory; nothing is stored.
 */
export async function captureFrames(
  video: HTMLVideoElement,
  opts: {
    durationMs: number;
    fps?: number;
    maxFrames?: number;
    signal?: AbortSignal;
    onTick?: (elapsedMs: number) => void;
  },
): Promise<CapturedFrame[]> {
  const fps = opts.fps ?? CAPTURE_FPS;
  const schedule = captureSchedule(fps, opts.durationMs, opts.maxFrames ?? MAX_LIVENESS_FRAMES);
  const canvas = document.createElement("canvas");
  const blobs: Blob[] = [];
  const abs: number[] = [];
  const start = performance.now();
  for (const offset of schedule) {
    if (opts.signal?.aborted) throw new DOMException("Capture aborted", "AbortError");
    const wait = start + offset - performance.now();
    if (wait > 0) await sleep(wait);
    else if (wait < -1000 / fps) continue; // fell a whole frame behind: skip this slot
    const t = performance.now();
    const blob = await grabJpeg(video, canvas);
    if (blob && blob.size > 0 && blob.size <= MAX_FRAME_BYTES) {
      blobs.push(blob);
      abs.push(t);
    }
    opts.onTick?.(t - start);
  }
  const ts = relativeTimestamps(abs);
  return blobs.map((blob, i) => ({ blob, t: ts[i] }));
}
