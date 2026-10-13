import { ApiError, ok, route } from "@/server/http";
import { requireSession } from "@/server/auth/sessions";
import { cancelRecovery } from "@/server/recovery/actions";
import { getRecoveryRequest } from "@/server/recovery/service";

// full session of the account owner. Admins use /api/admin/recovery/:id/cancel (reauth).
export const POST = route(async (_req, ctx: RouteContext<"/api/recovery/[id]/cancel">) => {
  const { id } = await ctx.params;
  const { user } = await requireSession();
  const rec = getRecoveryRequest(id);
  if (!rec || rec.userId !== user.id) throw new ApiError("NOT_FOUND", "Recovery not found.");
  await cancelRecovery(rec, "user", user);
  return ok({ ok: true });
});
