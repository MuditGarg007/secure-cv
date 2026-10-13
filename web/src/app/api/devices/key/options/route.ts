import { route, ok } from "@/server/http";
import { requireSession } from "@/server/auth/sessions";
import { startRegistration } from "@/server/auth/webauthn";

export const POST = route(async () => {
  const { user } = await requireSession({ reauth: true });
  const options = await startRegistration({ purpose: "add_key", userId: user.id, excludeUserId: user.id, user });
  return ok({ options });
});
