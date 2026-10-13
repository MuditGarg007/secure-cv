import { ok, route } from "@/server/http";
import { startAuthentication } from "@/server/auth/webauthn";

// Discoverable login: no allowCredentials, the authenticator picks the account.
export const POST = route(async () => {
  const options = await startAuthentication({ purpose: "login" });
  return ok({ options });
});
