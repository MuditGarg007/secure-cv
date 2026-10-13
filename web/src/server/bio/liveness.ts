import "server-only";
import type { GESTURES } from "@/server/config";
import { ApiError } from "@/server/http";

// ============================================================================
// CONTRACT STUB, owned by agent B (bio). Agent D (recovery) and B's own step-up
// routes call these. B replaces the bodies; the exported names, argument and
// return types are FROZEN (change only via the master).
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

/** Parse + validate the multipart liveness upload. Throws ApiError("VALIDATION"). */
export async function parseLivenessSubmission(_req: Request): Promise<LivenessSubmission> {
  throw new ApiError("BIO_UNAVAILABLE");
}

/**
 * New random gesture challenge stored in `challenges` (purpose, userId, targetId = recoveryId
 * for recovery). Throws BIO_NOT_ENROLLED if the user has no face template.
 */
export async function createLivenessChallenge(_opts: {
  userId: string;
  purpose: LivenessPurpose;
  targetId?: string;
}): Promise<LivenessChallengeDTO> {
  throw new ApiError("BIO_UNAVAILABLE");
}

/**
 * Sends frames + template to bio and returns the decision. Checks the challenge belongs to
 * userId/purpose/targetId, decrements attempts, deletes the challenge on pass or when attempts
 * hit 0. Does NOT write auth_events or touch sessions/recovery state: the caller does.
 * Throws CHALLENGE_EXPIRED, BIO_NOT_ENROLLED, BIO_UNAVAILABLE.
 */
export async function verifyLiveness(_opts: {
  userId: string;
  purpose: LivenessPurpose;
  targetId?: string;
  submission: LivenessSubmission;
}): Promise<LivenessResult> {
  throw new ApiError("BIO_UNAVAILABLE");
}
