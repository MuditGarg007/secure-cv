import { z } from "zod";
import { ok, parseJson, route } from "@/server/http";
import { startRecovery } from "@/server/recovery/actions";

const Body = z.object({
  handle: z.string().trim().min(1).max(64),
  code: z.string().min(1).max(64),
});

// No session: the recovery code is the credential here. Binding cookie set on success.
export const POST = route(async (req) => {
  const { handle, code } = await parseJson(req, Body);
  return ok(await startRecovery(handle, code));
});
