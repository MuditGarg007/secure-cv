import "server-only";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import type { AuthEvent, AuthEventType } from "@/server/db/schema";

export const EVENT_LIMIT = 100;

export type EventRow = AuthEvent & { deviceLabel: string | null; handle: string | null };

/** auth_events newest first, with the credential label and user handle joined in. */
export function listEvents(opts: { userId?: string; type?: AuthEventType | null; limit?: number } = {}): EventRow[] {
  const where: SQL[] = [];
  if (opts.userId) where.push(eq(schema.authEvents.userId, opts.userId));
  if (opts.type) where.push(eq(schema.authEvents.type, opts.type));
  return db
    .select({
      e: schema.authEvents,
      deviceLabel: schema.credentials.label,
      handle: schema.users.handle,
    })
    .from(schema.authEvents)
    .leftJoin(schema.credentials, eq(schema.authEvents.credentialId, schema.credentials.id))
    .leftJoin(schema.users, eq(schema.authEvents.userId, schema.users.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(schema.authEvents.id))
    .limit(opts.limit ?? EVENT_LIMIT)
    .all()
    .map((r) => ({ ...r.e, deviceLabel: r.deviceLabel, handle: r.handle }));
}
