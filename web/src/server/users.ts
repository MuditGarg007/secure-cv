import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import type { User } from "@/server/db/schema";
import { adminHandles } from "@/server/env";

export const HANDLE_RE = /^[a-z0-9_]{3,32}$/;

export function getUserById(id: string): User | undefined {
  return db.select().from(schema.users).where(eq(schema.users.id, id)).get();
}

export function getUserByHandle(handle: string): User | undefined {
  return db.select().from(schema.users).where(eq(schema.users.handle, handle.toLowerCase())).get();
}

export function isAdmin(user: Pick<User, "handle">): boolean {
  return adminHandles.has(user.handle.toLowerCase());
}

export function hasFace(user: Pick<User, "faceTemplateEnc">): boolean {
  return !!user.faceTemplateEnc;
}
