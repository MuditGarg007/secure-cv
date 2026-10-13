import { z } from "zod";
import { route, parseJson, ok, ApiError } from "@/server/http";
import { requireSession } from "@/server/auth/sessions";
import { startAuthentication } from "@/server/auth/webauthn";
import { getLink } from "@/server/devices/links";
import { canApprove } from "@/server/devices/link-state";

const Body = z.object({ nonce: z.string().min(1).max(100) });

export const POST = route(async (req, ctx: RouteContext<"/api/link/[id]/approve/options">) => {
  const { id } = await ctx.params;
  const { user } = await requireSession();
  const { nonce } = await parseJson(req, Body);
  const link = getLink(id);
  if (!link || !canApprove(link, nonce, Date.now())) throw new ApiError("NOT_FOUND", "This link is no longer valid.");
  // Challenge bound to this link id: an approval can't be replayed on another link.
  const options = await startAuthentication({ purpose: "link_approve", userId: user.id, targetId: link.id });
  return ok({ options });
});
