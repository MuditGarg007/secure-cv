import { z } from "zod";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { route, parseJson, ok, ApiError } from "@/server/http";
import { requireSession } from "@/server/auth/sessions";
import { finishRegistration, registrationResponseSchema, saveCredential } from "@/server/auth/webauthn";
import { logEvent } from "@/server/events";
import { notify } from "@/server/notifications";

const Body = z.object({
  response: registrationResponseSchema,
  label: z.string().trim().min(1).max(60).optional(),
});

export const POST = route(async (req) => {
  const { user } = await requireSession({ reauth: true });
  const body = await parseJson(req, Body);
  const { challenge, credential } = await finishRegistration({
    purpose: "add_key",
    response: body.response as unknown as RegistrationResponseJSON,
  });
  // The challenge was issued to this user's session; refuse one started by another account.
  if (challenge.userId !== user.id) throw new ApiError("CHALLENGE_EXPIRED");
  const saved = await saveCredential({ userId: user.id, credential, label: body.label ?? "Security key" });
  await logEvent({ type: "credential_added", userId: user.id, credentialId: saved.id });
  notify(user.id, `New security key added: ${saved.label}`);
  return ok({ ok: true });
});
