import { ApiError, ok, route } from "@/server/http";
import { requireSession } from "@/server/auth/sessions";
import { cancelRecovery } from "@/server/recovery/actions";
import { getRecoveryRequest } from "@/server/recovery/service";

// admin+reauth. Writes recovery_cancelled (for the owner) + admin_action (for the admin).
export const POST = route(async (_req, ctx: RouteContext<"/api/admin/recovery/[id]/cancel">) => {
  const { id } = await ctx.params;
  const { user } = await requireSession({ admin: true, reauth: true });
  const rec = getRecoveryRequest(id);
  if (!rec) throw new ApiError("NOT_FOUND", "Recovery not found.");
  await cancelRecovery(rec, "admin", user);
  return ok({ ok: true });
});
