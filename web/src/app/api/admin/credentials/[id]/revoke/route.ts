import { route, ok, ApiError } from "@/server/http";
import { requireSession } from "@/server/auth/sessions";
import { getCredential, revokeCredential } from "@/server/auth/credentials";
import { logEvent } from "@/server/events";
import { notify } from "@/server/notifications";

export const POST = route(async (_req, ctx: RouteContext<"/api/admin/credentials/[id]/revoke">) => {
  const { id } = await ctx.params;
  const { user: admin } = await requireSession({ admin: true, reauth: true });
  const cred = getCredential(id);
  if (!cred || cred.revokedAt) throw new ApiError("NOT_FOUND");
  revokeCredential(cred.id, "admin");
  await logEvent({
    type: "admin_action",
    userId: admin.id,
    metadata: { action: "revoke_credential", target: cred.id, targetUserId: cred.userId },
  });
  await logEvent({
    type: "credential_revoked",
    userId: cred.userId,
    credentialId: cred.id,
    metadata: { reason: "admin" },
  });
  notify(cred.userId, `An administrator removed your device: ${cred.label}`);
  return ok({ ok: true });
});
