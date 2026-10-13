import { route, ok } from "@/server/http";
import { env } from "@/server/env";
import { requestMeta } from "@/server/request-meta";
import { createLink } from "@/server/devices/links";

// New device, no session. Sets the link_bind cookie that ties the link to this browser.
export const POST = route(async () => {
  const { ua } = await requestMeta();
  const link = await createLink(ua);
  return ok({
    linkId: link.id,
    shortCode: link.shortCode,
    qrUrl: `${env.ORIGIN}/link/${link.id}#${link.nonce}`,
    expiresAt: link.expiresAt,
  });
});
