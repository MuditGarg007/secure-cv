import { z } from "zod";
import { route, parseJson, ok, ApiError } from "@/server/http";
import { requireSession } from "@/server/auth/sessions";
import { logEvent } from "@/server/events";
import { AuthorizeParams, parseAuthorize, redirectWith } from "@/server/oauth/params";
import { issueCode, takeLivenessPass } from "@/server/oauth/service";

const Body = AuthorizeParams.extend({ decision: z.enum(["approve", "deny"]) });

// POST /api/oauth/approve (full+reauth): the consent screen's answer → {redirect}.
// "liveness" requests also need a passed /api/oauth/liveness check on this session.
export const POST = route(async (req) => {
  const { decision, ...raw } = await parseJson(req, Body);
  const parsed = parseAuthorize(raw);
  if (!parsed.ok) throw new ApiError("VALIDATION", parsed.message);
  const { params } = parsed;

  if (decision === "deny") {
    await requireSession();
    return ok({ redirect: redirectWith(params.redirect_uri, { error: "access_denied", state: params.state }) });
  }

  const { session, user } = await requireSession({ reauth: true });
  if (params.acr_values === "liveness" && !takeLivenessPass(session.id)) {
    throw new ApiError("STEP_UP_REQUIRED", "Face and gesture check needed.");
  }
  const code = issueCode({ user, session, params });
  await logEvent({
    type: "app_authorized",
    userId: user.id,
    credentialId: session.credentialId,
    metadata: { client: params.client_id, acr: params.acr_values },
  });
  return ok({ redirect: redirectWith(params.redirect_uri, { code, state: params.state }) });
});
