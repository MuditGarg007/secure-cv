import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/server/db/client";

// Read-only queries for the account pages (/home, /security).

export type SignInSummary = { at: number; country: string | null; ua: string | null };

/** Most recent successful sign-ins (incl. sign-up and passed step-ups), newest first. */
export function recentSignIns(userId: string, limit = 2): SignInSummary[] {
  return db
    .select({
      at: schema.authEvents.createdAt,
      country: schema.authEvents.country,
      ua: schema.authEvents.ua,
    })
    .from(schema.authEvents)
    .where(
      and(
        eq(schema.authEvents.userId, userId),
        inArray(schema.authEvents.type, ["login_success", "step_up_pass", "register", "recovery_completed"]),
      ),
    )
    .orderBy(desc(schema.authEvents.id))
    .limit(limit)
    .all();
}

export function hasActiveRecoveryCode(userId: string): boolean {
  return !!db
    .select({ id: schema.recoveryCodes.id })
    .from(schema.recoveryCodes)
    .where(
      and(
        eq(schema.recoveryCodes.userId, userId),
        isNull(schema.recoveryCodes.usedAt),
        isNull(schema.recoveryCodes.supersededAt),
      ),
    )
    .get();
}
