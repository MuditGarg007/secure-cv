import { route, ok, ApiError } from "@/server/http";
import { completeStepUp, endCurrentSession, requireSession } from "@/server/auth/sessions";
import { logEvent } from "@/server/events";
import { notify } from "@/server/notifications";
import { parseLivenessSubmission, toClientResult, verifyLiveness } from "@/server/bio/liveness";
import { countryLabel } from "@/server/bio/rules";
import { stepUpOrigin } from "@/server/bio/store";

// POST /api/stepup/verify (session, pending ok): multipart liveness upload → {passed, hint?, attemptsLeft}.
// Pass clears step-up (token rotated). 0 attempts left ends the session. Liveness alone never
// creates a session: it only completes one that a passkey already started.
export const POST = route(async (req) => {
  const { session, user } = await requireSession({ allowPending: true });
  if (!session.stepUpPending) throw new ApiError("FORBIDDEN");
  const submission = await parseLivenessSubmission(req);
  const result = await verifyLiveness({
    userId: user.id,
    purpose: "stepup_liveness",
    targetId: session.id,
    submission,
  });

  if (result.passed) {
    await completeStepUp(session.id);
    await logEvent({
      type: "step_up_pass",
      userId: user.id,
      credentialId: session.credentialId,
      metadata: { bio: result.detail },
    });
    notify(user.id, `New sign-in from ${countryLabel(stepUpOrigin(session).country)}`);
  } else {
    await logEvent({
      type: "step_up_fail",
      userId: user.id,
      credentialId: session.credentialId,
      metadata: { bio: result.detail, attemptsLeft: result.attemptsLeft },
    });
    if (result.attemptsLeft === 0) await endCurrentSession(session.id);
  }
  return ok(toClientResult(result));
});
