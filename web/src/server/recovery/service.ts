import "server-only";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import type { RecoveryRequest } from "@/server/db/schema";
import { env } from "@/server/env";
import { ApiError } from "@/server/http";
import {
  RECOVERY_BIND_COOKIE,
  RECOVERY_COOLDOWN_CODE_LIVENESS_MS,
  RECOVERY_COOLDOWN_CODE_ONLY_MS,
  RECOVERY_IDLE_EXPIRY_MS,
} from "@/server/config";
import { readBindingHash } from "@/server/auth/challenges";
import { OPEN_STATES, transition, type MachineConfig, type RecoveryEvent } from "./machine";

// DB side of recovery: load requests, apply machine transitions, persist. Routes and the
// banner/admin components go through here so lazy transitions are always applied.

export function machineConfig(): MachineConfig {
  return {
    cooldownCodeLivenessMs: RECOVERY_COOLDOWN_CODE_LIVENESS_MS,
    cooldownCodeOnlyMs: RECOVERY_COOLDOWN_CODE_ONLY_MS,
    idleExpiryMs: RECOVERY_IDLE_EXPIRY_MS,
    cooldownOverrideMs:
      env.RECOVERY_COOLDOWN_OVERRIDE_S !== undefined ? env.RECOVERY_COOLDOWN_OVERRIDE_S * 1000 : undefined,
  };
}

export function getRecoveryRequest(id: string): RecoveryRequest | undefined {
  return db.select().from(schema.recoveryRequests).where(eq(schema.recoveryRequests.id, id)).get();
}

/**
 * Apply `event` and persist it. The UPDATE is conditional on the state we read, so two racing
 * calls (double-submit, cancel vs complete) can't both win: the loser gets RECOVERY_STATE.
 */
export function applyEvent(req: RecoveryRequest, event: RecoveryEvent, now = Date.now()): RecoveryRequest {
  const r = transition(req, event, now, machineConfig());
  if ("error" in r) throw new ApiError("RECOVERY_STATE", "This recovery can't do that right now.");
  if (r.state === req.state && r.updatedAt === req.updatedAt && r.cooldownUntil === req.cooldownUntil) {
    return req; // tick with nothing to do
  }
  const updated = db
    .update(schema.recoveryRequests)
    .set({
      state: r.state,
      cooldownUntil: r.cooldownUntil,
      updatedAt: r.updatedAt,
      ...(r.cancelledBy ? { cancelledBy: r.cancelledBy } : {}),
    })
    .where(and(eq(schema.recoveryRequests.id, req.id), eq(schema.recoveryRequests.state, req.state)))
    .returning()
    .get();
  if (!updated) throw new ApiError("RECOVERY_STATE", "This recovery changed. Reload and try again.");
  return updated;
}

/** Apply lazy time-based transitions (cooldown over, idle expiry) and persist them. */
export function settleRequest(req: RecoveryRequest): RecoveryRequest {
  try {
    return applyEvent(req, { type: "tick" });
  } catch (e) {
    // Lost a race with another writer: whatever is in the DB now is the truth.
    if (e instanceof ApiError) return getRecoveryRequest(req.id) ?? req;
    throw e;
  }
}

/** All of a user's requests, newest first, with lazy transitions applied. */
export function recoveryRequestsForUser(userId: string): RecoveryRequest[] {
  return db
    .select()
    .from(schema.recoveryRequests)
    .where(eq(schema.recoveryRequests.userId, userId))
    .orderBy(desc(schema.recoveryRequests.createdAt))
    .all()
    .map(settleRequest);
}

/** The user's open request (pending_liveness | cooling_down | ready), if any. */
export function openRecoveryRequest(userId: string): RecoveryRequest | undefined {
  return db
    .select()
    .from(schema.recoveryRequests)
    .where(
      and(eq(schema.recoveryRequests.userId, userId), inArray(schema.recoveryRequests.state, [...OPEN_STATES])),
    )
    .orderBy(desc(schema.recoveryRequests.createdAt))
    .all()
    .map(settleRequest)
    .find((r) => OPEN_STATES.includes(r.state));
}

/**
 * Load a request for the browser holding its `rec_bind` cookie, settled. A wrong or missing
 * cookie looks exactly like an unknown id (NOT_FOUND), so ids can't be probed.
 */
export async function requireBoundRequest(id: string): Promise<RecoveryRequest> {
  const hash = await readBindingHash(RECOVERY_BIND_COOKIE);
  const req = getRecoveryRequest(id);
  if (!req || !hash || req.bindingHash !== hash) throw new ApiError("NOT_FOUND", "Recovery not found.");
  return settleRequest(req);
}

/** Failed liveness attempts so far for this request, across all its challenges (from auth_events). */
export function livenessFailCount(req: RecoveryRequest): number {
  const row = db
    .select({ n: count() })
    .from(schema.authEvents)
    .where(
      and(
        eq(schema.authEvents.type, "recovery_liveness_fail"),
        eq(schema.authEvents.userId, req.userId),
        sql`json_extract(${schema.authEvents.metadata}, '$.recoveryId') = ${req.id}`,
      ),
    )
    .get();
  return row?.n ?? 0;
}

/** Client view of a request's timing: ISO strings (docs/architecture.md#conventions). */
export function toClientRequest(req: RecoveryRequest) {
  return {
    state: req.state,
    method: req.method,
    cooldownUntil: req.cooldownUntil ? new Date(req.cooldownUntil).toISOString() : undefined,
    serverNow: new Date().toISOString(),
  };
}
