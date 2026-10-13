import { route, ok } from "@/server/http";
import { assertNotExpired, getBoundLink } from "@/server/devices/links";

// Polled by the new device (link_bind cookie).
export const GET = route(async (_req, ctx: RouteContext<"/api/link/[id]/status">) => {
  const { id } = await ctx.params;
  const link = await getBoundLink(id);
  assertNotExpired(link);
  return ok({ status: link.status });
});
