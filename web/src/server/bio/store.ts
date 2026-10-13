import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import type { Session } from "@/server/db/schema";

/** Store (or clear, with null) the user's encrypted face template blob from bio. */
export function setFaceTemplate(userId: string, templateEnc: string | null): void {
  db.update(schema.users).set({ faceTemplateEnc: templateEnc }).where(eq(schema.users.id, userId)).run();
}

// The step_up_required event may be written just before or after the session row.
const EVENT_SLACK_MS = 60 * 1000;

/**
 * Risk signals + country of the login that put this session into step-up (logged by the auth
 * routes as `step_up_required`). Used for the reason text and the "New sign-in from" notice.
 */
export function stepUpOrigin(session: Pick<Session, "userId" | "createdAt">): {
  signals: string[];
  country: string | null;
} {
  const e = schema.authEvents;
  const row = db
    .select({ signals: e.riskSignals, country: e.country })
    .from(e)
    .where(
      and(eq(e.userId, session.userId), eq(e.type, "step_up_required"), gte(e.createdAt, session.createdAt - EVENT_SLACK_MS)),
    )
    .orderBy(desc(e.id))
    .get();
  return { signals: row?.signals ?? [], country: row?.country ?? null };
}
