import { ApiError, ok, route } from "@/server/http";
import { parseLivenessSubmission, toClientResult, verifyLiveness } from "@/server/bio/liveness";
import { logEvent } from "@/server/events";
import { notify } from "@/server/notifications";
import { RECOVERY_LIVENESS_MAX_FAILS } from "@/server/config";
import { applyEvent, livenessFailCount, requireBoundRequest } from "@/server/recovery/service";

// cookie:rec_bind, state pending_liveness. Multipart frames → bio. The client sees only
// {passed, hint?, attemptsLeft}; the full bio decision goes to auth_events.metadata.
export const POST = route(async (req, ctx: RouteContext<"/api/recovery/[id]/liveness/verify">) => {
  const { id } = await ctx.params;
  const rec = await requireBoundRequest(id);
  if (rec.state !== "pending_liveness") throw new ApiError("RECOVERY_STATE", "No face check needed now.");
  const submission = await parseLivenessSubmission(req);
  const result = await verifyLiveness({
    userId: rec.userId,
    purpose: "recovery_liveness",
    targetId: rec.id,
    submission,
  });

  if (result.passed) {
    applyEvent(rec, { type: "liveness_pass" });
    await logEvent({
      type: "recovery_liveness_pass",
      userId: rec.userId,
      metadata: { ...result.detail, recoveryId: rec.id },
    });
    return ok(toClientResult(result));
  }

  await logEvent({
    type: "recovery_liveness_fail",
    userId: rec.userId,
    metadata: { ...result.detail, recoveryId: rec.id },
  });
  // Capped per request, not just per challenge, so fetching a new challenge doesn't reset it.
  const attemptsLeft = Math.max(
    0,
    Math.min(result.attemptsLeft, RECOVERY_LIVENESS_MAX_FAILS - livenessFailCount(rec)),
  );
  if (attemptsLeft === 0) {
    applyEvent(rec, { type: "liveness_fail_final" });
    await logEvent({
      type: "recovery_cancelled",
      userId: rec.userId,
      metadata: { recoveryId: rec.id, reason: "liveness_failed" },
    });
    notify(rec.userId, "A recovery attempt on your account failed the face check and was stopped.");
  }
  return ok(toClientResult({ ...result, attemptsLeft }));
});
