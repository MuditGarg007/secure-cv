import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import type { Credential } from "@/server/db/schema";
import { revokeSessionsForCredential } from "@/server/auth/sessions";

export type RevokeReason = NonNullable<Credential["revokedReason"]>;

export function activeCredentials(userId: string): Credential[] {
  return db
    .select()
    .from(schema.credentials)
    .where(and(eq(schema.credentials.userId, userId), isNull(schema.credentials.revokedAt)))
    .orderBy(desc(schema.credentials.createdAt))
    .all();
}

export function getCredential(rowId: string): Credential | undefined {
  return db.select().from(schema.credentials).where(eq(schema.credentials.id, rowId)).get();
}

export function getCredentialByWebauthnId(credentialId: string): Credential | undefined {
  return db
    .select()
    .from(schema.credentials)
    .where(eq(schema.credentials.credentialId, credentialId))
    .get();
}

/** Mark a credential revoked and kill its sessions. Caller writes the auth_events row. */
export function revokeCredential(rowId: string, reason: RevokeReason): void {
  db.update(schema.credentials)
    .set({ revokedAt: Date.now(), revokedReason: reason })
    .where(and(eq(schema.credentials.id, rowId), isNull(schema.credentials.revokedAt)))
    .run();
  revokeSessionsForCredential(rowId);
}
