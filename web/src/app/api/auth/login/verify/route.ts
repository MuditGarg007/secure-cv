import { z } from "zod";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { ApiError, ok, parseJson, route } from "@/server/http";
import { hasFace } from "@/server/users";
import { logEvent } from "@/server/events";
import { notify } from "@/server/notifications";
import { requestMeta } from "@/server/request-meta";
import { labelFromUA } from "@/lib/ua";
import { createSession } from "@/server/auth/sessions";
import { authenticationResponseSchema, finishAuthentication } from "@/server/auth/webauthn";
import { assessLogin, restoreLastUsed } from "@/server/auth/login";
import { topReason } from "@/server/risk";

const Body = z.object({ response: authenticationResponseSchema });

export const POST = route(async (req) => {
  const body = await parseJson(req, Body);
  const { credential, user, previous } = await finishAuthentication({
    purpose: "login",
    response: body.response as unknown as AuthenticationResponseJSON,
  });
  const meta = await requestMeta();
  const r = assessLogin({ user, previous, meta });
  const ev = { userId: user.id, credentialId: credential.id, riskScore: r.score, riskSignals: r.signals, meta };

  if (r.decision === "allow") {
    await createSession({ userId: user.id, credentialId: credential.id });
    await logEvent({ type: "login_success", ...ev });
    return ok({ status: "ok" as const });
  }

  if (r.decision === "step_up" && hasFace(user)) {
    await createSession({ userId: user.id, credentialId: credential.id, stepUpPending: true });
    await logEvent({ type: "step_up_required", ...ev });
    return ok({ status: "step_up" as const, reason: topReason(r.signals) });
  }

  // block, or step_up with no face enrolled: no session.
  restoreLastUsed(credential.id, previous);
  await logEvent({
    type: "blocked",
    ...ev,
    metadata: { reason: r.decision === "block" ? "risk_score" : "step_up_no_face" },
  });
  const where = meta.country ? `${meta.country} on ${labelFromUA(meta.ua)}` : labelFromUA(meta.ua);
  notify(user.id, `We blocked a sign-in from ${where}. If this was you, sign in from a device you've used before.`);
  throw new ApiError("BLOCKED", "We stopped this sign-in. Check your other devices.");
});
