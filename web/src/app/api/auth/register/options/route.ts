import { z } from "zod";
import { ApiError, ok, parseJson, route } from "@/server/http";
import { HANDLE_RE, getUserByHandle } from "@/server/users";
import { newWebauthnUserId, startRegistration } from "@/server/auth/webauthn";

const Body = z.object({
  handle: z.string().trim().toLowerCase().regex(HANDLE_RE),
  displayName: z.string().trim().min(1).max(64),
});

export const POST = route(async (req) => {
  const { handle, displayName } = await parseJson(req, Body);
  if (getUserByHandle(handle)) throw new ApiError("HANDLE_TAKEN", "That username is taken.");
  // The user row is created in register/verify, only after the passkey verifies.
  const webauthnUserId = newWebauthnUserId();
  const options = await startRegistration({
    purpose: "register",
    user: { webauthnUserId, handle, displayName },
    data: { handle, displayName, webauthnUserId },
  });
  return ok({ options });
});
