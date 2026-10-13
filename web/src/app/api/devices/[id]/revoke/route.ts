import { z } from "zod";
import { route, parseJson, ok, ApiError } from "@/server/http";
import { endCurrentSession, requireSession } from "@/server/auth/sessions";
import { revokeCredential } from "@/server/auth/credentials";
import { logEvent } from "@/server/events";
import { notify } from "@/server/notifications";
import { activeCount, ownActiveCredential } from "@/server/devices/devices";

const Body = z.object({ reason: z.enum(["lost", "user"]) });

export const POST = route(async (req, ctx: RouteContext<"/api/devices/[id]/revoke">) => {
  const { id } = await ctx.params;
  const { session, user } = await requireSession({ reauth: true });
  const { reason } = await parseJson(req, Body);
  const cred = ownActiveCredential(user.id, id);
  if (activeCount(user.id) <= 1) {
    throw new ApiError("LAST_CREDENTIAL", "Add another device first. This is your only one.");
  }
  revokeCredential(cred.id, reason);
  await logEvent({ type: "credential_revoked", userId: user.id, credentialId: cred.id, metadata: { reason } });
  notify(user.id, `Device removed: ${cred.label}`);
  const signedOut = session.credentialId === cred.id;
  if (signedOut) await endCurrentSession(session.id);
  return ok({ ok: true, signedOut });
});
