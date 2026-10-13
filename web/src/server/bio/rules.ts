import type { LivenessHint } from "@/server/bio/liveness";

// Pure helpers for the liveness routes. No db/env/next imports: unit tested in rules.test.ts.

/** Bio verify reasons (bio/app/decision.py) plus `template_invalid`. */
export type BioReason =
  | "multiple_faces"
  | "no_face"
  | "face_mismatch"
  | "discontinuity"
  | "prompt_missing"
  | "timing"
  | "template_invalid";

/**
 * Coarse hint for the browser (AGENTS.md rule 9). Anything about identity collapses to the
 * vaguest hint so the client never learns whether the face matched.
 */
export function hintFromReasons(reasons: readonly string[]): LivenessHint {
  const has = (r: BioReason) => reasons.includes(r);
  if (has("face_mismatch") || has("discontinuity") || has("template_invalid")) return "try_again";
  if (has("timing")) return "too_slow";
  if (has("no_face") || has("multiple_faces")) return "face_not_visible";
  if (has("prompt_missing")) return "gesture_not_seen";
  return "try_again";
}

export type EnrollHint = "no_face" | "multiple_faces" | "low_quality";

/** Enrollment failures are shown as-is (the user is signed in and just reauthenticated). */
export function enrollHint(reason: string | undefined): EnrollHint {
  return reason === "no_face" || reason === "multiple_faces" ? reason : "low_quality";
}

/** Frame timestamps: one per frame, finite, starting at >= 0, strictly increasing. */
export function validTimestamps(ts: readonly number[], frameCount: number): boolean {
  if (ts.length !== frameCount) return false;
  for (let i = 0; i < ts.length; i++) {
    if (!Number.isFinite(ts[i]) || ts[i] < 0) return false;
    if (i > 0 && ts[i] <= ts[i - 1]) return false;
  }
  return true;
}

/** Attempts for a new challenge: carry over what earlier challenges for the same target left. */
export function carriedAttempts(previous: readonly (number | null)[], max: number): number {
  const left = previous.filter((n): n is number => n !== null);
  return left.length ? Math.max(0, Math.min(max, ...left)) : max;
}

/** "new location" etc. for "This sign-in looks unusual (...)". Only the category, never details. */
export function stepUpReasonText(signals: readonly string[] | null | undefined): string {
  const s = signals ?? [];
  if (s.includes("new_country")) return "new location";
  if (s.includes("ua_change")) return "new device or browser";
  if (s.includes("recent_failures")) return "several failed sign-ins";
  return "unusual activity";
}

/** "India" for "IN"; falls back to the code, or "a new location" when unknown. */
export function countryLabel(code: string | null | undefined): string {
  if (!code) return "a new location";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
