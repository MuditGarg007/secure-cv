import { route, ok } from "@/server/http";
import { requireSession } from "@/server/auth/sessions";
import { logEvent } from "@/server/events";
import { hasFace } from "@/server/users";
import { setFaceTemplate } from "@/server/bio/store";

// DELETE /api/bio (full+reauth): forget the face template.
export const DELETE = route(async () => {
  const { session, user } = await requireSession({ reauth: true });
  if (hasFace(user)) {
    setFaceTemplate(user.id, null);
    await logEvent({ type: "bio_deleted", userId: user.id, credentialId: session.credentialId });
  }
  return ok({ ok: true });
});
