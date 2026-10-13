import { z } from "zod";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { route, parseJson, ok, ApiError } from "@/server/http";
import { createSession } from "@/server/auth/sessions";
import { clearCookie } from "@/server/auth/challenges";
import { finishRegistration, registrationResponseSchema, saveCredential } from "@/server/auth/webauthn";
import { logEvent } from "@/server/events";
import { notify } from "@/server/notifications";
import { requestMeta } from "@/server/request-meta";
import { labelFromUA } from "@/lib/ua";
import { LINK_BIND_COOKIE } from "@/server/config";
import { assertNotExpired, getBoundLink, moveLink } from "@/server/devices/links";
import { canRegister } from "@/server/devices/link-state";

const Body = z.object({ response: registrationResponseSchema });

export const POST = route(async (req, ctx: RouteContext<"/api/link/[id]/register/verify">) => {
  const { id } = await ctx.params;
  const link = await getBoundLink(id);
  const body = await parseJson(req, Body);
  assertNotExpired(link);
  if (!canRegister(link, Date.now())) throw new ApiError("FORBIDDEN", "Approve this device first.");
  const userId = link.userId!;
  const { challenge, credential } = await finishRegistration({
    purpose: "link_register",
    response: body.response as unknown as RegistrationResponseJSON,
    targetId: link.id,
  });
  if (challenge.userId !== userId) throw new ApiError("CHALLENGE_EXPIRED");
  // Single use: only one registration can consume an approved link.
  if (!moveLink(link.id, "approved", "consumed")) throw new ApiError("LINK_EXPIRED");

  const { ua } = await requestMeta();
  const label = labelFromUA(ua);
  const saved = await saveCredential({ userId, credential, label });
  await createSession({ userId, credentialId: saved.id });
  await clearCookie(LINK_BIND_COOKIE);
  await logEvent({ type: "device_linked", userId, credentialId: saved.id, metadata: { stage: "registered", linkId: link.id } });
  notify(userId, `New device added: ${label}`);
  return ok({ ok: true });
});
