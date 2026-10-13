import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { GESTURES } from "@/server/config";
import {
  LIVENESS_CAPTURE_WINDOW_MS,
  LIVENESS_CHALLENGE_TTL_MS,
  LIVENESS_MAX_ATTEMPTS,
  MAX_LIVENESS_FRAMES,
} from "@/server/config";
import { ApiError } from "@/server/http";
import { db, schema } from "@/server/db/client";
import { createChallenge, deleteChallenge, peekChallenge } from "@/server/auth/challenges";
import { getUserById, hasFace } from "@/server/users";
import { generatePrompts, parsePrompts } from "@/server/bio/challenge";
import { bioVerify } from "@/server/bio/client";
import { FakeChoice, readFrameForm } from "@/server/bio/form";
import { carriedAttempts, hintFromReasons, validTimestamps } from "@/server/bio/rules";

// ============================================================================
// CONTRACT, owned by agent B (bio). Agent D (recovery) and B's own step-up
// routes call these. The exported names, argument and return types are FROZEN
// (change only via the master). Added (optional only): LivenessSubmission.fake.
// ============================================================================

export type Gesture = (typeof GESTURES)[number];
export type LivenessPurpose = "stepup_liveness" | "recovery_liveness";
export type LivenessHint = "face_not_visible" | "gesture_not_seen" | "too_slow" | "try_again";

/** Exactly what the challenge routes return to the browser. */
export type LivenessChallengeDTO = {
  challengeId: string;
  prompts: Gesture[];
  expiresAt: string; // ISO
  captureWindowMs: number;
};

/** Parsed multipart body: `meta` JSON {challengeId, timestamps} + frame_000.jpg ... */
export type LivenessSubmission = {
  challengeId: string;
  timestamps: number[];
  frames: Blob[];
  /** Dev-only pass/fail choice; forwarded to bio only while bio runs with BIO_FAKE=1. */
  fake?: string;
};

export type LivenessResult = {
  passed: boolean;
  hint?: LivenessHint;
  attemptsLeft: number;
  /** Full bio decision (reasons + scores). For auth_events.metadata ONLY. Never send to the client. */
  detail: Record<string, unknown>;
};

/** Client-safe view of a result (AGENTS.md rule 9). Routes return exactly this. */
export function toClientResult(r: LivenessResult): { passed: boolean; hint?: LivenessHint; attemptsLeft: number } {
  return { passed: r.passed, hint: r.hint, attemptsLeft: r.attemptsLeft };
}

const NOT_ENROLLED_MSG = "Face check isn't set up for this account.";

const SubmissionMeta = z.object({
  challengeId: z.string().min(1).max(64),
  timestamps: z.array(z.number()).max(MAX_LIVENESS_FRAMES),
  fake: FakeChoice.optional(),
});

/** Parse + validate the multipart liveness upload. Throws ApiError("VALIDATION"). */
export async function parseLivenessSubmission(req: Request): Promise<LivenessSubmission> {
  const { meta, frames } = await readFrameForm(req, MAX_LIVENESS_FRAMES);
  const m = SubmissionMeta.safeParse(meta);
  if (!m.success) throw new ApiError("VALIDATION", "Bad liveness upload.");
  if (frames.length === 0 || !validTimestamps(m.data.timestamps, frames.length)) {
    throw new ApiError("VALIDATION", "Bad liveness upload.");
  }
  return { challengeId: m.data.challengeId, timestamps: m.data.timestamps, frames, fake: m.data.fake };
}

function sameTarget(userId: string, purpose: LivenessPurpose, targetId: string | null) {
  const c = schema.challenges;
  return and(
    eq(c.userId, userId),
    eq(c.purpose, purpose),
    targetId === null ? isNull(c.targetId) : eq(c.targetId, targetId),
  );
}

/**
 * New random gesture challenge stored in `challenges` (purpose, userId, targetId = recoveryId
 * for recovery). Throws BIO_NOT_ENROLLED if the user has no face template.
 *
 * Replaces any earlier challenge for the same user/purpose/target and inherits its remaining
 * attempts, so asking for fresh prompts never resets the attempt limit. All DB calls are
 * synchronous (better-sqlite3), so this runs without interleaving.
 */
export async function createLivenessChallenge(opts: {
  userId: string;
  purpose: LivenessPurpose;
  targetId?: string;
}): Promise<LivenessChallengeDTO> {
  const user = getUserById(opts.userId);
  if (!user || !hasFace(user)) throw new ApiError("BIO_NOT_ENROLLED", NOT_ENROLLED_MSG);
  const target = opts.targetId ?? null;
  const where = sameTarget(opts.userId, opts.purpose, target);
  const previous = db.select({ left: schema.challenges.attemptsLeft }).from(schema.challenges).where(where).all();
  const attempts = carriedAttempts(
    previous.map((p) => p.left),
    LIVENESS_MAX_ATTEMPTS,
  );
  if (attempts <= 0) throw new ApiError("CHALLENGE_EXPIRED");
  db.delete(schema.challenges).where(where).run();

  const prompts = generatePrompts();
  const row = createChallenge({
    purpose: opts.purpose,
    challenge: JSON.stringify(prompts),
    userId: opts.userId,
    targetId: target,
    attemptsLeft: attempts,
    ttlMs: LIVENESS_CHALLENGE_TTL_MS,
  });
  return {
    challengeId: row.id,
    prompts,
    expiresAt: new Date(row.expiresAt).toISOString(),
    captureWindowMs: LIVENESS_CAPTURE_WINDOW_MS,
  };
}

/**
 * Sends frames + template to bio and returns the decision. Checks the challenge belongs to
 * userId/purpose/targetId, decrements attempts, deletes the challenge on pass or when attempts
 * hit 0. Does NOT write auth_events or touch sessions/recovery state: the caller does.
 * Throws CHALLENGE_EXPIRED, BIO_NOT_ENROLLED, BIO_UNAVAILABLE.
 */
export async function verifyLiveness(opts: {
  userId: string;
  purpose: LivenessPurpose;
  targetId?: string;
  submission: LivenessSubmission;
}): Promise<LivenessResult> {
  const { submission } = opts;
  const row = peekChallenge(submission.challengeId, opts.purpose, opts.targetId);
  if (row.userId !== opts.userId || row.targetId !== (opts.targetId ?? null)) {
    throw new ApiError("CHALLENGE_EXPIRED");
  }
  const prompts = parsePrompts(row.challenge);
  if (!prompts) {
    deleteChallenge(row.id);
    throw new ApiError("CHALLENGE_EXPIRED");
  }
  const user = getUserById(opts.userId);
  if (!user?.faceTemplateEnc) throw new ApiError("BIO_NOT_ENROLLED", NOT_ENROLLED_MSG);

  // Take the attempt BEFORE the slow bio call, so parallel uploads can't exceed the limit.
  const c = schema.challenges;
  const taken = db
    .update(c)
    .set({ attemptsLeft: sql`${c.attemptsLeft} - 1` })
    .where(and(eq(c.id, row.id), gt(c.attemptsLeft, 0)))
    .returning({ left: c.attemptsLeft })
    .get();
  if (!taken) throw new ApiError("CHALLENGE_EXPIRED");
  const attemptsLeft = taken.left ?? 0;

  let res;
  try {
    res = await bioVerify({
      userId: user.id,
      templateEnc: user.faceTemplateEnc,
      prompts,
      expiresAt: new Date(row.expiresAt),
      timestamps: submission.timestamps,
      frames: submission.frames,
      fake: submission.fake,
    });
  } catch (e) {
    // Our infrastructure failed, not the user: give the attempt back.
    db.update(c)
      .set({ attemptsLeft: sql`${c.attemptsLeft} + 1` })
      .where(eq(c.id, row.id))
      .run();
    throw e;
  }

  if (res.passed || attemptsLeft === 0) deleteChallenge(row.id);
  return {
    passed: res.passed,
    hint: res.passed ? undefined : hintFromReasons(res.reasons),
    attemptsLeft,
    detail: {
      reasons: res.reasons,
      scores: res.scores,
      prompts,
      frames: submission.frames.length,
      attempt: LIVENESS_MAX_ATTEMPTS - attemptsLeft,
    },
  };
}
