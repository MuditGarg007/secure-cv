import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { z } from "zod";
import { ApiError, ok, parseJson, route } from "@/server/http";
import { finishRegistration, registrationResponseSchema } from "@/server/auth/webauthn";
import { completeRecovery } from "@/server/recovery/actions";
import { requireBoundRequest } from "@/server/recovery/service";

const Body = z.object({ response: registrationResponseSchema });

// cookie:rec_bind, state ready. The registration challenge is bound to this recovery id.
// Revokes all old credentials + sessions, issues a new recovery code and a session.
export const POST = route(async (req, ctx: RouteContext<"/api/recovery/[id]/complete/verify">) => {
  const { id } = await ctx.params;
  const { response } = await parseJson(req, Body);
  const rec = await requireBoundRequest(id);
  if (rec.state !== "ready") throw new ApiError("RECOVERY_STATE", "This recovery isn't ready yet.");
  const { challenge, credential } = await finishRegistration({
    purpose: "recovery_register",
    response: response as unknown as RegistrationResponseJSON,
    targetId: rec.id,
  });
  if (challenge.userId !== rec.userId) throw new ApiError("WEBAUTHN_FAILED");
  return ok(await completeRecovery(rec, credential));
});
