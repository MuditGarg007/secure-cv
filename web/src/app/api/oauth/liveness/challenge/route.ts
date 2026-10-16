import { route, ok } from "@/server/http";
import { requireSession } from "@/server/auth/sessions";
import { createLivenessChallenge } from "@/server/bio/liveness";

// POST /api/oauth/liveness/challenge (full+reauth): an app asked for acr "liveness".
// Bound to this session; a pass is spent by the next /api/oauth/approve.
export const POST = route(async () => {
  const { session, user } = await requireSession({ reauth: true });
  return ok(await createLivenessChallenge({ userId: user.id, purpose: "oauth_liveness", targetId: session.id }));
});
