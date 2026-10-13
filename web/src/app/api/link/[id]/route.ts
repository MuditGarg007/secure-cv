import { route, ok, ApiError } from "@/server/http";
import { requireSession } from "@/server/auth/sessions";
import { labelFromUA } from "@/lib/ua";
import { getLink } from "@/server/devices/links";
import { canApprove } from "@/server/devices/link-state";

// Approver (signed-in device that scanned the QR). Nonce comes from the URL fragment.
export const GET = route(async (req, ctx: RouteContext<"/api/link/[id]">) => {
  const { id } = await ctx.params;
  await requireSession();
  const nonce = req.nextUrl.searchParams.get("n") ?? "";
  const link = getLink(id);
  if (!link || !canApprove(link, nonce, Date.now())) throw new ApiError("NOT_FOUND", "This link is no longer valid.");
  return ok({ shortCode: link.shortCode, ua: labelFromUA(link.requesterUa), createdAt: link.createdAt });
});
