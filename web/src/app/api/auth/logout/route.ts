import { ok, route } from "@/server/http";
import { logEvent } from "@/server/events";
import { endCurrentSession, requireSession } from "@/server/auth/sessions";

export const POST = route(async () => {
  const { session, user } = await requireSession({ allowPending: true });
  await endCurrentSession(session.id);
  await logEvent({ type: "logout", userId: user.id, credentialId: session.credentialId });
  return ok({ ok: true });
});
