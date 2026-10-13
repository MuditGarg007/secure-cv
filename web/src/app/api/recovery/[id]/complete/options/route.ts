import { ApiError, ok, route } from "@/server/http";
import { startRegistration } from "@/server/auth/webauthn";
import { getUserById } from "@/server/users";
import { requireBoundRequest } from "@/server/recovery/service";

// cookie:rec_bind, state ready. No excludeCredentials: the old passkeys are being replaced.
export const POST = route(async (_req, ctx: RouteContext<"/api/recovery/[id]/complete/options">) => {
  const { id } = await ctx.params;
  const rec = await requireBoundRequest(id);
  if (rec.state !== "ready") throw new ApiError("RECOVERY_STATE", "This recovery isn't ready yet.");
  const user = getUserById(rec.userId);
  if (!user) throw new ApiError("NOT_FOUND", "Recovery not found.");
  const options = await startRegistration({
    purpose: "recovery_register",
    userId: user.id,
    targetId: rec.id,
    user,
  });
  return ok({ options });
});
