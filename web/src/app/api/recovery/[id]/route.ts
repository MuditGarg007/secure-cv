import { ok, route } from "@/server/http";
import { requireBoundRequest, toClientRequest } from "@/server/recovery/service";

// cookie:rec_bind. Applies lazy transitions (cooldown over → ready, idle → expired).
export const GET = route(async (_req, ctx: RouteContext<"/api/recovery/[id]">) => {
  const { id } = await ctx.params;
  return ok(toClientRequest(await requireBoundRequest(id)));
});
