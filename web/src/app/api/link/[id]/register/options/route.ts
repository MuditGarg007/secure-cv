import { route, ok, ApiError } from "@/server/http";
import { startRegistration } from "@/server/auth/webauthn";
import { getUserById } from "@/server/users";
import { assertNotExpired, getBoundLink } from "@/server/devices/links";
import { canRegister } from "@/server/devices/link-state";

// New device (link_bind cookie), only after the link was approved.
export const POST = route(async (_req, ctx: RouteContext<"/api/link/[id]/register/options">) => {
  const { id } = await ctx.params;
  const link = await getBoundLink(id);
  assertNotExpired(link);
  if (!canRegister(link, Date.now())) throw new ApiError("FORBIDDEN", "Approve this device first.");
  const user = getUserById(link.userId!);
  if (!user) throw new ApiError("NOT_FOUND");
  const options = await startRegistration({
    purpose: "link_register",
    userId: user.id,
    excludeUserId: user.id,
    targetId: link.id,
    user,
  });
  return ok({ options });
});
