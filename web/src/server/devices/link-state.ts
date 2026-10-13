// Pure device-link state rules (docs/flows.md §4). No db/env/next imports: unit tested.
import type { DeviceLink } from "@/server/db/schema";

export type LinkStatus = DeviceLink["status"] | "expired";

type LinkLike = Pick<DeviceLink, "status" | "expiresAt">;

/** Status as the user sees it: open states past expires_at read as "expired". */
export function effectiveStatus(link: LinkLike, now: number): LinkStatus {
  if (link.status === "consumed" || link.status === "denied") return link.status;
  return now >= link.expiresAt ? "expired" : link.status;
}

/** Length-checked compare that doesn't stop at the first differing char. */
export function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The approver may see / approve the link only while it is pending and the nonce matches. */
export function canApprove(link: LinkLike & Pick<DeviceLink, "nonce">, nonce: string, now: number): boolean {
  return effectiveStatus(link, now) === "pending" && sameSecret(link.nonce, nonce);
}

/** The new device may register a passkey only after approval, before expiry, once. */
export function canRegister(link: LinkLike & Pick<DeviceLink, "userId">, now: number): boolean {
  return effectiveStatus(link, now) === "approved" && !!link.userId;
}
