import { z } from "zod";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { route, parseJson, ok, ApiError } from "@/server/http";
import { markReauth, requireSession } from "@/server/auth/sessions";
import { authenticationResponseSchema, finishAuthentication } from "@/server/auth/webauthn";
import { logEvent } from "@/server/events";
import { notify } from "@/server/notifications";
import { labelFromUA } from "@/lib/ua";
import { assertNotExpired, getLink, moveLink } from "@/server/devices/links";

const Body = z.object({
  response: authenticationResponseSchema,
  decision: z.enum(["approve", "deny"]),
});

export const POST = route(async (req, ctx: RouteContext<"/api/link/[id]/approve/verify">) => {
  const { id } = await ctx.params;
  const { session, user } = await requireSession();
  const body = await parseJson(req, Body);
  const { credential } = await finishAuthentication({
    purpose: "link_approve",
    response: body.response as unknown as AuthenticationResponseJSON,
    targetId: id,
    expectedUserId: user.id,
  });
  // A fresh assertion from this user's own passkey counts as reauth (docs/auth.md#sessions).
  markReauth(session.id);

  const link = getLink(id);
  if (!link) throw new ApiError("NOT_FOUND");
  assertNotExpired(link);
  const approve = body.decision === "approve";
  if (!moveLink(id, "pending", approve ? "approved" : "denied", approve ? user.id : undefined)) {
    throw new ApiError("NOT_FOUND", "This link is no longer valid.");
  }
  await logEvent({
    type: "device_linked",
    userId: user.id,
    credentialId: credential.id,
    metadata: { stage: approve ? "approved" : "denied", linkId: id },
  });
  if (approve) notify(user.id, `You approved a new device: ${labelFromUA(link.requesterUa)}`);
  return ok({ ok: true });
});
