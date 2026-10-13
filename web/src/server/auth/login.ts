import "server-only";
import { and, count, eq, gt, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import type { Credential, User } from "@/server/db/schema";
import { RECENT_FAILURES_WINDOW_MS } from "@/server/config";
import type { RequestMeta } from "@/server/request-meta";
import { uaFamily } from "@/lib/ua";
import { risk, type RiskResult } from "@/server/risk";

// Impure side of the risk check: gathers the user's history from auth_events and feeds
// the pure risk() in server/risk.ts. Call BEFORE logging this login's own event.

/** Countries where this user previously signed in successfully (or registered). */
export function knownCountries(userId: string): string[] {
  const rows = db
    .selectDistinct({ country: schema.authEvents.country })
    .from(schema.authEvents)
    .where(
      and(
        eq(schema.authEvents.userId, userId),
        inArray(schema.authEvents.type, ["login_success", "step_up_pass", "register"]),
        isNotNull(schema.authEvents.country),
      ),
    )
    .all();
  return rows.map((r) => r.country).filter((c): c is string => !!c);
}

/** login_fail events for this user within RECENT_FAILURES_WINDOW_MS. */
export function recentFailureCount(userId: string): number {
  const row = db
    .select({ n: count() })
    .from(schema.authEvents)
    .where(
      and(
        eq(schema.authEvents.userId, userId),
        eq(schema.authEvents.type, "login_fail"),
        gt(schema.authEvents.createdAt, Date.now() - RECENT_FAILURES_WINDOW_MS),
      ),
    )
    .get();
  return row?.n ?? 0;
}

/**
 * finishAuthentication() already stamped last_used_* with this request. For a blocked login,
 * put the previous values back so an attacker's UA doesn't become the "known" one for the
 * next attempt. sign_count stays updated (clone detection needs it).
 */
export function restoreLastUsed(
  credentialRowId: string,
  previous: Pick<Credential, "lastUsedAt" | "lastUsedUa">,
): void {
  db.update(schema.credentials)
    .set({ lastUsedAt: previous.lastUsedAt, lastUsedUa: previous.lastUsedUa })
    .where(eq(schema.credentials.id, credentialRowId))
    .run();
}

export function assessLogin(opts: {
  user: User;
  previous: Pick<Credential, "lastUsedUa">;
  meta: RequestMeta;
}): RiskResult {
  return risk({
    country: opts.meta.country,
    uaFamily: uaFamily(opts.meta.ua),
    previousUaFamily: opts.previous.lastUsedUa ? uaFamily(opts.previous.lastUsedUa) : null,
    knownCountries: knownCountries(opts.user.id),
    recentFailures: recentFailureCount(opts.user.id),
  });
}
