import { ApiError, ok, route } from "@/server/http";
import { createLivenessChallenge } from "@/server/bio/liveness";
import { requireBoundRequest } from "@/server/recovery/service";

// cookie:rec_bind, state pending_liveness. Challenge is bound to this recovery id.
export const POST = route(async (_req, ctx: RouteContext<"/api/recovery/[id]/liveness/challenge">) => {
  const { id } = await ctx.params;
  const rec = await requireBoundRequest(id);
  if (rec.state !== "pending_liveness") throw new ApiError("RECOVERY_STATE", "No face check needed now.");
  return ok(await createLivenessChallenge({ userId: rec.userId, purpose: "recovery_liveness", targetId: rec.id }));
});
