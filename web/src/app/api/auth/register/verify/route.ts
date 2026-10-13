import { z } from "zod";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { ApiError, ok, parseJson, route } from "@/server/http";
import { getUserByHandle } from "@/server/users";
import { logEvent } from "@/server/events";
import { requestMeta } from "@/server/request-meta";
import { labelFromUA } from "@/lib/ua";
import { createSession } from "@/server/auth/sessions";
import { finishRegistration, registrationResponseSchema } from "@/server/auth/webauthn";
import { createUserWithCredential, pendingSignup } from "@/server/auth/signup";

const Body = z.object({ response: registrationResponseSchema });

export const POST = route(async (req) => {
  const body = await parseJson(req, Body);
  const { challenge, credential } = await finishRegistration({
    purpose: "register",
    response: body.response as unknown as RegistrationResponseJSON,
  });
  const pending = pendingSignup(challenge);
  if (getUserByHandle(pending.handle)) throw new ApiError("HANDLE_TAKEN", "That username is taken.");

  const meta = await requestMeta();
  const created = createUserWithCredential({
    pending,
    credential,
    label: labelFromUA(meta.ua),
    ua: meta.ua,
  });
  await createSession({ userId: created.user.id, credentialId: created.credential.id });
  await logEvent({ type: "register", userId: created.user.id, credentialId: created.credential.id, meta });
  return ok({ ok: true });
});
