import { ok, route } from "@/server/http";
import { logEvent } from "@/server/events";
import { issueRecoveryCode } from "@/server/recovery-code";
import { requireSession } from "@/server/auth/sessions";

// Issues a new recovery code (supersedes the old one). The plaintext is returned once
// and never logged.
export const POST = route(async () => {
  const { session, user } = await requireSession({ reauth: true });
  const code = await issueRecoveryCode(user.id);
  await logEvent({ type: "recovery_code_generated", userId: user.id, credentialId: session.credentialId });
  return ok({ code });
});
