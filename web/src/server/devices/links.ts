import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import type { DeviceLink } from "@/server/db/schema";
import { ApiError } from "@/server/http";
import { LINK_BIND_COOKIE, LINK_TTL_MS } from "@/server/config";
import { randomDigits, randomToken } from "@/server/crypto";
import { readBindingHash, setBindingCookie } from "@/server/auth/challenges";
import { effectiveStatus, sameSecret } from "@/server/devices/link-state";

// QR device link (docs/flows.md §4). All state lives in device_links.

export async function createLink(requesterUa: string | null): Promise<DeviceLink> {
  const bindingHash = await setBindingCookie(LINK_BIND_COOKIE, LINK_TTL_MS);
  return db
    .insert(schema.deviceLinks)
    .values({
      shortCode: randomDigits(6),
      nonce: randomToken(),
      bindingHash,
      requesterUa,
      status: "pending",
      expiresAt: Date.now() + LINK_TTL_MS,
    })
    .returning()
    .get();
}

export function getLink(id: string): DeviceLink | undefined {
  return db.select().from(schema.deviceLinks).where(eq(schema.deviceLinks.id, id)).get();
}

/** Link started by THIS browser (link_bind cookie), else NOT_FOUND. */
export async function getBoundLink(id: string): Promise<DeviceLink> {
  const link = getLink(id);
  const hash = await readBindingHash(LINK_BIND_COOKIE);
  if (!link || !hash || !sameSecret(hash, link.bindingHash)) throw new ApiError("NOT_FOUND");
  return link;
}

/** Throws LINK_EXPIRED if the link is past its expiry and still open. */
export function assertNotExpired(link: DeviceLink): void {
  if (effectiveStatus(link, Date.now()) === "expired") throw new ApiError("LINK_EXPIRED");
}

/**
 * Compare-and-set status change. Returns false if the link was no longer in `from`
 * (lost a race, e.g. a double-submitted approval or registration).
 */
export function moveLink(
  id: string,
  from: DeviceLink["status"],
  to: DeviceLink["status"],
  userId?: string,
): boolean {
  const res = db
    .update(schema.deviceLinks)
    .set(userId ? { status: to, userId } : { status: to })
    .where(and(eq(schema.deviceLinks.id, id), eq(schema.deviceLinks.status, from)))
    .run();
  return res.changes === 1;
}
