import { UAParser } from "ua-parser-js";

/** Human label for a credential/device, e.g. "Chrome on Android". Safe on server and client. */
export function labelFromUA(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const r = UAParser(ua);
  const browser = r.browser.name;
  const os = r.os.name;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? "Unknown device";
}

/** Coarse "browser family + OS" key used by the risk check's ua_change signal. */
export function uaFamily(ua: string | null | undefined): string {
  if (!ua) return "unknown";
  const r = UAParser(ua);
  return `${r.browser.name ?? "?"}|${r.os.name ?? "?"}`;
}
