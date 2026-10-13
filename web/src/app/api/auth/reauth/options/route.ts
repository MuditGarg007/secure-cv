import { ok, route } from "@/server/http";
import { requireSession } from "@/server/auth/sessions";
import { startAuthentication } from "@/server/auth/webauthn";

// Fresh passkey assertion for a sensitive action. Bound to this session via targetId.
export const POST = route(async () => {
  const { session, user } = await requireSession();
  const options = await startAuthentication({ purpose: "reauth", userId: user.id, targetId: session.id });
  return ok({ options });
});
