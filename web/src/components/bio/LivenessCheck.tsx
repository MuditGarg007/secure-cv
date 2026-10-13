"use client";
// CONTRACT STUB, owned by agent B (bio). Props are FROZEN; B replaces the body.
// Full liveness UI: fetch challenge, camera, prompt cards + voice, countdown, upload, retry.
// Used by B on /signin/step-up and by agent D on /recover/[id].

export type LivenessCheckProps = {
  /** POST → LivenessChallengeDTO, e.g. "/api/stepup/challenge" or "/api/recovery/<id>/liveness/challenge". */
  challengeUrl: string;
  /** POST multipart → {passed, hint?, attemptsLeft}. */
  verifyUrl: string;
  onPassed: () => void;
  /** No attempts left (or a non-retryable error). */
  onFailedFinal: () => void;
};

export function LivenessCheck(_props: LivenessCheckProps) {
  return <div className="rounded-lg border p-4 text-sm">Face + gesture check is not built yet.</div>;
}
