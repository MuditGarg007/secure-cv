import { route, ok, ApiError } from "@/server/http";
import { requireSession } from "@/server/auth/sessions";
import { createLivenessChallenge } from "@/server/bio/liveness";

// POST /api/stepup/challenge (session, pending ok; only while step-up is pending).
// The challenge is bound to this session, so attempts are counted per risky login.
export const POST = route(async () => {
  const { session, user } = await requireSession({ allowPending: true });
  if (!session.stepUpPending) throw new ApiError("FORBIDDEN");
  return ok(await createLivenessChallenge({ userId: user.id, purpose: "stepup_liveness", targetId: session.id }));
});
