import "server-only";
import { z } from "zod";
import { MAX_FRAME_BYTES } from "@/server/config";
import { ApiError } from "@/server/http";
import { FRAME_FIELD_RE, frameFieldName } from "@/lib/camera";

// Reads the browser's multipart upload: `meta` JSON + frame_000 ... JPEG parts.
// Frames stay in memory and are only forwarded to bio. Never logged or stored.

const MAX_META_CHARS = 20_000;

/** Dev pass/fail choice for BIO_FAKE runs (ignored unless bio reports fake mode). */
export const FakeChoice = z.string().regex(/^(pass|fail:[a-z_]{1,32})$/);

export async function readFrameForm(req: Request, maxFrames: number): Promise<{ meta: unknown; frames: Blob[] }> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxFrames * MAX_FRAME_BYTES + MAX_META_CHARS + 64 * 1024) {
    throw new ApiError("VALIDATION", "Upload too large.");
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError("VALIDATION", "Expected multipart form data.");
  }

  const rawMeta = form.getAll("meta");
  if (rawMeta.length !== 1 || typeof rawMeta[0] !== "string" || rawMeta[0].length > MAX_META_CHARS) {
    throw new ApiError("VALIDATION", "Missing meta.");
  }
  let meta: unknown;
  try {
    meta = JSON.parse(rawMeta[0]);
  } catch {
    throw new ApiError("VALIDATION", "Bad meta.");
  }

  const keys = [...form.keys()];
  const frameKeys = keys.filter((k) => k !== "meta");
  if (frameKeys.some((k) => !FRAME_FIELD_RE.test(k)) || new Set(frameKeys).size !== frameKeys.length) {
    throw new ApiError("VALIDATION", "Unexpected upload field.");
  }
  if (frameKeys.length > maxFrames) throw new ApiError("VALIDATION", "Too many frames.");

  const frames: Blob[] = [];
  for (let i = 0; i < frameKeys.length; i++) {
    const f = form.get(frameFieldName(i)); // indices must be contiguous from 000
    if (!(f instanceof Blob) || f.size === 0 || f.size > MAX_FRAME_BYTES || (f.type && f.type !== "image/jpeg")) {
      throw new ApiError("VALIDATION", "Bad frame.");
    }
    frames.push(f);
  }
  return { meta, frames };
}
