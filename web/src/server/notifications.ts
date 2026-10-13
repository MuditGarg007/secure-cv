import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/server/db/client";

export function notify(userId: string, text: string): void {
  db.insert(schema.notifications).values({ userId, text }).run();
}

export function unreadNotifications(userId: string) {
  return db
    .select()
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)))
    .orderBy(desc(schema.notifications.createdAt))
    .all();
}

export function markNotificationsRead(userId: string, ids: string[]): void {
  if (ids.length === 0) return;
  db.update(schema.notifications)
    .set({ readAt: Date.now() })
    .where(and(eq(schema.notifications.userId, userId), inArray(schema.notifications.id, ids)))
    .run();
}
