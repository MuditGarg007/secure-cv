import "server-only";
import { desc, eq, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/server/db/client";

export type AdminUserRow = {
  id: string;
  handle: string;
  displayName: string;
  faceEnrolled: boolean;
  activeDevices: number;
  lastLogin: number | null;
};

export function listUsers(): AdminUserRow[] {
  const u = schema.users;
  return db
    .select({
      id: u.id,
      handle: u.handle,
      displayName: u.displayName,
      faceEnrolled: sql<number>`${u.faceTemplateEnc} is not null`,
      activeDevices: sql<number>`(select count(*) from credentials c where c.user_id = ${u.id} and c.revoked_at is null)`,
      lastLogin: sql<number | null>`(select max(e.created_at) from auth_events e where e.user_id = ${u.id} and e.type = 'login_success')`,
    })
    .from(u)
    .orderBy(u.handle)
    .all()
    .map((r) => ({ ...r, faceEnrolled: !!r.faceEnrolled }));
}

export function revokedCredentials(limit = 100) {
  const c = schema.credentials;
  return db
    .select({
      id: c.id,
      label: c.label,
      revokedAt: c.revokedAt,
      revokedReason: c.revokedReason,
      userId: c.userId,
      handle: schema.users.handle,
    })
    .from(c)
    .innerJoin(schema.users, eq(c.userId, schema.users.id))
    .where(isNotNull(c.revokedAt))
    .orderBy(desc(c.revokedAt))
    .limit(limit)
    .all();
}
