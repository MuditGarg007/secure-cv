import "server-only";
import { createHash, randomBytes } from "node:crypto";

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");
export const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");
/** n-digit numeric code, e.g. the 6-digit device-link short code. */
export function randomDigits(n: number): string {
  let out = "";
  for (const b of randomBytes(n)) out += String(b % 10);
  return out;
}
