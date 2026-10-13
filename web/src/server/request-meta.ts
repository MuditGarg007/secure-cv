import "server-only";
import { headers } from "next/headers";
import { env } from "@/server/env";

export type RequestMeta = { ip: string | null; ua: string | null; country: string | null };

/**
 * Client ip / user agent / country for the current request.
 * Country comes from host geo headers; with DEBUG_RISK=1 the `X-Debug-Country`
 * header (set by the hidden "Simulate location" toggle) overrides it. Demo only.
 */
export async function requestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  let country = h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry") ?? null;
  if (env.DEBUG_RISK === "1") {
    const debug = h.get("x-debug-country");
    if (debug && /^[A-Za-z]{2}$/.test(debug)) country = debug.toUpperCase();
  }
  return { ip, ua: h.get("user-agent"), country };
}
