import "server-only";
import { and, eq, isNull, lte } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import type { RecoveryRequest, User } from "@/server/db/schema";
import { ApiError } from "@/server/http";
import { RECOVERY_BIND_COOKIE, RECOVERY_BIND_TTL_MS } from "@/server/config";
import { logEvent } from "@/server/events";
import { notify } from "@/server/notifications";
import { requestMeta } from "@/server/request-meta";
import { HANDLE_RE, getUserByHandle, getUserById, hasFace } from "@/server/users";
import { checkRecoveryCode, issueRecoveryCode, markRecoveryCodeUsed } from "@/server/recovery-code";
import { clearCookie, setBindingCookie } from "@/server/auth/challenges";
import { createSession, revokeAllSessionsForUser } from "@/server/auth/sessions";
import { activeCredentials } from "@/server/auth/credentials";
import type { NewCredential } from "@/server/auth/webauthn";
import { labelFromUA } from "@/lib/ua";
import { startState } from "./machine";
import { applyEvent, machineConfig, openRecoveryRequest } from "./service";

const INVALID = "That handle and recovery code don't match an account we can recover.";

/** POST /api/recovery/start. Every failure is the same generic RECOVERY_INVALID. */
export async function startRecovery(handle: string, code: string) {
  const h = handle.trim().toLowerCase();
  const user = HANDLE_RE.test(h) ? getUserByHandle(h) : undefined;
  // Always one argon2 verify, known handle or not, so timing doesn't reveal handles.
  const codeId = await checkRecoveryCode(user?.id ?? null, code);
  if (!user || !codeId) {
    if (user) {
      await logEvent({ type: "login_fail", userId: user.id, metadata: { purpose: "recovery_start", reason: "bad_code" } });
    }
    throw new ApiError("RECOVERY_INVALID", INVALID);
  }
  if (openRecoveryRequest(user.id)) {
    // One open request per user. Same generic error: don't tell a code holder what's going on.
    await logEvent({
      type: "login_fail",
      userId: user.id,
      metadata: { purpose: "recovery_start", reason: "already_open" },
    });
    throw new ApiError("RECOVERY_INVALID", INVALID);
  }

  const method = hasFace(user) ? "code_liveness" : "code_only";
  const now = Date.now();
  const initial = startState(method, now, machineConfig());
  const bindingHash = await setBindingCookie(RECOVERY_BIND_COOKIE, RECOVERY_BIND_TTL_MS);
  const req = db
    .insert(schema.recoveryRequests)
    .values({
      userId: user.id,
      method,
      state: initial.state,
      cooldownUntil: initial.cooldownUntil,
      updatedAt: initial.updatedAt,
      bindingHash,
      createdAt: now,
    })
    .returning()
    .get();
  await logEvent({ type: "recovery_started", userId: user.id, metadata: { recoveryId: req.id, method } });
  notify(user.id, "Recovery started for your account. Not you? Cancel it.");
  return { recoveryId: req.id, next: method === "code_liveness" ? ("liveness" as const) : ("cooldown" as const) };
}

/** Cancel an open request. `by` = who asked (owner session or admin); caller checks auth. */
export async function cancelRecovery(req: RecoveryRequest, by: "user" | "admin", actor: User) {
  const updated = applyEvent(req, { type: "cancel", by });
  await logEvent({
    type: "recovery_cancelled",
    userId: req.userId,
    metadata: { recoveryId: req.id, cancelledBy: by },
  });
  if (by === "admin") {
    await logEvent({
      type: "admin_action",
      userId: actor.id,
      metadata: { action: "recovery_cancel", recoveryId: req.id, targetUserId: req.userId },
    });
    notify(req.userId, "An administrator cancelled a recovery request on your account.");
  } else {
    notify(req.userId, "You cancelled a recovery request on your account.");
  }
  return updated;
}

/**
 * Final step, after the new passkey verified. In ONE transaction: state ready → completed
 * (conditional, so it runs once), revoke every old credential and session, save the new
 * credential, mark the recovery code used. Then issue a new code and a fresh session.
 */
export async function completeRecovery(req: RecoveryRequest, credential: NewCredential) {
  const user = getUserById(req.userId);
  if (!user) throw new ApiError("NOT_FOUND", "Recovery not found.");
  const { ua } = await requestMeta();
  const old = activeCredentials(user.id);
  const now = Date.now();

  const saved = db.transaction((tx) => {
    applyEvent(req, { type: "complete" }, now); // throws RECOVERY_STATE if not ready / raced
    tx.update(schema.credentials)
      .set({ revokedAt: now, revokedReason: "recovery" })
      .where(and(eq(schema.credentials.userId, user.id), isNull(schema.credentials.revokedAt)))
      .run();
    revokeAllSessionsForUser(user.id);
    const cred = tx
      .insert(schema.credentials)
      .values({
        userId: user.id,
        credentialId: credential.credentialId,
        publicKey: credential.publicKey,
        signCount: credential.signCount,
        transports: credential.transports,
        label: labelFromUA(ua),
        lastUsedAt: now,
        lastUsedUa: ua,
      })
      .returning()
      .get();
    // The code that started this request: the active one issued before it. (No column links
    // them; if the owner rotated the code meanwhile, issueRecoveryCode below supersedes it.)
    const code = tx
      .select({ id: schema.recoveryCodes.id })
      .from(schema.recoveryCodes)
      .where(
        and(
          eq(schema.recoveryCodes.userId, user.id),
          isNull(schema.recoveryCodes.usedAt),
          isNull(schema.recoveryCodes.supersededAt),
          lte(schema.recoveryCodes.createdAt, req.createdAt),
        ),
      )
      .get();
    if (code) markRecoveryCodeUsed(code.id);
    return cred;
  });

  for (const c of old) {
    await logEvent({
      type: "credential_revoked",
      userId: user.id,
      credentialId: c.id,
      metadata: { reason: "recovery", recoveryId: req.id },
    });
  }
  const newRecoveryCode = await issueRecoveryCode(user.id);
  await logEvent({ type: "recovery_code_generated", userId: user.id, metadata: { reason: "recovery" } });
  await createSession({ userId: user.id, credentialId: saved.id });
  await clearCookie(RECOVERY_BIND_COOKIE);
  await logEvent({
    type: "recovery_completed",
    userId: user.id,
    credentialId: saved.id,
    metadata: { recoveryId: req.id, method: req.method, revokedCredentials: old.length },
  });
  notify(user.id, "Your account was recovered. All old passkeys were removed and a new recovery code was issued.");
  return { ok: true as const, newRecoveryCode };
}
