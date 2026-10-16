import { route, ok } from "@/server/http";
import { requireSession } from "@/server/auth/sessions";
import { logEvent } from "@/server/events";
import { parseLivenessSubmission, toClientResult, verifyLiveness } from "@/server/bio/liveness";
import { recordLivenessPass } from "@/server/oauth/service";

// POST /api/oauth/liveness/verify (full+reauth): multipart → {passed, hint?, attemptsLeft}.
// Never creates a session: it only lets an already signed-in, freshly reauthed user approve an app request.
export const POST = route(async (req) => {
  const { session, user } = await requireSession({ reauth: true });
  const submission = await parseLivenessSubmission(req);
  const result = await verifyLiveness({ userId: user.id, purpose: "oauth_liveness", targetId: session.id, submission });
  if (result.passed) recordLivenessPass(session.id);
  await logEvent({
    type: result.passed ? "step_up_pass" : "step_up_fail",
    userId: user.id,
    credentialId: session.credentialId,
    metadata: { context: "app_approval", bio: result.detail, attemptsLeft: result.attemptsLeft },
  });
  return ok(toClientResult(result));
});
