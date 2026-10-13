import "server-only";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import type { Credential } from "@/server/db/schema";
import { ApiError } from "@/server/http";
import { activeCredentials, getCredential } from "@/server/auth/credentials";

/** Public fields of a credential row (never the key material). */
export type DeviceRow = Pick<
  Credential,
  "id" | "label" | "createdAt" | "lastUsedAt" | "lastUsedUa" | "revokedAt" | "revokedReason"
>;

const deviceCols = {
  id: schema.credentials.id,
  label: schema.credentials.label,
  createdAt: schema.credentials.createdAt,
  lastUsedAt: schema.credentials.lastUsedAt,
  lastUsedUa: schema.credentials.lastUsedUa,
  revokedAt: schema.credentials.revokedAt,
  revokedReason: schema.credentials.revokedReason,
};

export function listDevices(userId: string): { active: DeviceRow[]; removed: DeviceRow[] } {
  const active = db
    .select(deviceCols)
    .from(schema.credentials)
    .where(and(eq(schema.credentials.userId, userId), isNull(schema.credentials.revokedAt)))
    .orderBy(desc(schema.credentials.createdAt))
    .all();
  const removed = db
    .select(deviceCols)
    .from(schema.credentials)
    .where(and(eq(schema.credentials.userId, userId), isNotNull(schema.credentials.revokedAt)))
    .orderBy(desc(schema.credentials.revokedAt))
    .all();
  return { active, removed };
}

/** The user's own active credential, or NOT_FOUND (also for other users' ids). */
export function ownActiveCredential(userId: string, credentialRowId: string): Credential {
  const c = getCredential(credentialRowId);
  if (!c || c.userId !== userId || c.revokedAt) throw new ApiError("NOT_FOUND");
  return c;
}

export function renameCredential(rowId: string, label: string): void {
  db.update(schema.credentials).set({ label }).where(eq(schema.credentials.id, rowId)).run();
}

export function activeCount(userId: string): number {
  return activeCredentials(userId).length;
}

export const REVOKE_REASON_TEXT: Record<NonNullable<Credential["revokedReason"]>, string> = {
  lost: "Lost",
  user: "No longer used",
  admin: "Removed by admin",
  recovery: "Replaced by account recovery",
  clone_detected: "Copy detected",
};
