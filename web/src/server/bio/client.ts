import "server-only";
import { z } from "zod";
import { BIO_STATUS_CACHE_MS, BIO_TIMEOUT_MS } from "@/server/config";
import { env } from "@/server/env";
import { ApiError } from "@/server/http";
import type { Prompt } from "@/server/bio/challenge";
import { buildFrameForm } from "@/lib/camera";

// HTTP client for the bio service (docs/biometrics.md#bio-api). Every call carries
// X-Internal-Token; any network/HTTP/shape problem becomes BIO_UNAVAILABLE.
// Never log frames, templates or scores.

const EnrollRes = z.union([
  z.object({ ok: z.literal(true), templateEnc: z.string().min(1) }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);
export type BioEnrollResult = z.infer<typeof EnrollRes>;

const VerifyRes = z.object({
  passed: z.boolean(),
  reasons: z.array(z.string()),
  scores: z.record(z.string(), z.unknown()),
});
export type BioVerifyResult = z.infer<typeof VerifyRes>;

const HealthRes = z.object({ ok: z.literal(true), fake: z.boolean() });

async function call<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(new URL(path, env.BIO_URL), {
      ...init,
      headers: { "x-internal-token": env.BIO_INTERNAL_TOKEN },
      signal: AbortSignal.timeout(BIO_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new ApiError("BIO_UNAVAILABLE");
  }
  if (!res.ok) {
    console.error(`[bio] ${path} -> HTTP ${res.status}`);
    throw new ApiError("BIO_UNAVAILABLE");
  }
  const parsed = schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) {
    console.error(`[bio] ${path} -> unexpected response shape`);
    throw new ApiError("BIO_UNAVAILABLE");
  }
  return parsed.data;
}

let statusCache: { fake: boolean; at: number } | null = null;

/** Whether bio runs with BIO_FAKE=1 (cached briefly). Throws BIO_UNAVAILABLE if bio is down. */
export async function bioStatus(): Promise<{ fake: boolean }> {
  if (statusCache && Date.now() - statusCache.at < BIO_STATUS_CACHE_MS) return { fake: statusCache.fake };
  const { fake } = await call("/healthz", HealthRes);
  statusCache = { fake, at: Date.now() };
  return { fake };
}

/**
 * The browser's dev pass/fail choice is forwarded ONLY while bio reports fake mode. Bio also
 * ignores it in real mode, so a browser can never steer a real decision.
 */
async function devFake(fake: string | undefined): Promise<{ fake?: string }> {
  if (!fake) return {};
  return (await bioStatus()).fake ? { fake } : {};
}

export async function bioEnroll(opts: { userId: string; frames: readonly Blob[]; fake?: string }) {
  const meta = { userId: opts.userId, ...(await devFake(opts.fake)) };
  return call("/enroll", EnrollRes, { method: "POST", body: buildFrameForm(meta, opts.frames) });
}

export async function bioVerify(opts: {
  userId: string;
  templateEnc: string;
  prompts: readonly Prompt[];
  expiresAt: Date;
  timestamps: readonly number[];
  frames: readonly Blob[];
  fake?: string;
}) {
  const meta = {
    userId: opts.userId,
    templateEnc: opts.templateEnc,
    prompts: opts.prompts,
    expiresAt: opts.expiresAt.toISOString(),
    timestamps: opts.timestamps,
    ...(await devFake(opts.fake)),
  };
  return call("/verify", VerifyRes, { method: "POST", body: buildFrameForm(meta, opts.frames) });
}
