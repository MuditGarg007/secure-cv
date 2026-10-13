import { z } from "zod";
import { ok, parseJson, route } from "@/server/http";
import { markNotificationsRead } from "@/server/notifications";
import { requireSession } from "@/server/auth/sessions";

const Body = z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(100) });

export const POST = route(async (req) => {
  const { user } = await requireSession();
  const { ids } = await parseJson(req, Body);
  markNotificationsRead(user.id, ids);
  return ok({ ok: true });
});
