import { z } from "zod";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { ok, parseJson, route } from "@/server/http";
import { logEvent } from "@/server/events";
import { markReauth, requireSession } from "@/server/auth/sessions";
import { authenticationResponseSchema, finishAuthentication } from "@/server/auth/webauthn";

const Body = z.object({ response: authenticationResponseSchema });

export const POST = route(async (req) => {
  const { session, user } = await requireSession();
  const body = await parseJson(req, Body);
  const { credential } = await finishAuthentication({
    purpose: "reauth",
    response: body.response as unknown as AuthenticationResponseJSON,
    targetId: session.id,
    expectedUserId: user.id,
  });
  markReauth(session.id);
  await logEvent({ type: "reauth", userId: user.id, credentialId: credential.id });
  return ok({ ok: true });
});
