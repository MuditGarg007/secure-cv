import { z } from "zod";
import { route, parseJson, ok } from "@/server/http";
import { requireSession } from "@/server/auth/sessions";
import { ownActiveCredential, renameCredential } from "@/server/devices/devices";

const Body = z.object({ label: z.string().trim().min(1).max(60) });

export const PATCH = route(async (req, ctx: RouteContext<"/api/devices/[id]">) => {
  const { id } = await ctx.params;
  const { user } = await requireSession();
  const { label } = await parseJson(req, Body);
  ownActiveCredential(user.id, id);
  renameCredential(id, label);
  return ok({ ok: true });
});
