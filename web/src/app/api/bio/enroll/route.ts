import { z } from "zod";
import { route, ok, ApiError } from "@/server/http";
import { requireSession } from "@/server/auth/sessions";
import { logEvent } from "@/server/events";
import { hasFace } from "@/server/users";
import { ENROLL_FRAME_COUNT, GESTURE_ENROLL_FRAME_COUNT } from "@/server/config";
import { bioEnroll } from "@/server/bio/client";
import { FakeChoice, readFrameForm } from "@/server/bio/form";
import { enrollHint } from "@/server/bio/rules";
import { setFaceTemplate } from "@/server/bio/store";

// POST /api/bio/enroll (full+reauth): multipart meta={consent:true} + 5 face frames, then 15 custom
// gesture frames (3 captures x 5) → {ok} / {ok:false, hint}. One template holds both.
const TOTAL_FRAMES = ENROLL_FRAME_COUNT + GESTURE_ENROLL_FRAME_COUNT;
const Meta = z.object({ consent: z.literal(true), fake: FakeChoice.optional() });

export const POST = route(async (req) => {
  const { session, user } = await requireSession({ reauth: true });
  const { meta, frames } = await readFrameForm(req, TOTAL_FRAMES);
  const m = Meta.safeParse(meta);
  if (!m.success) throw new ApiError("VALIDATION", "Please agree to the face scan first.");
  if (frames.length !== TOTAL_FRAMES) throw new ApiError("VALIDATION", "Wrong number of photos.");

  const res = await bioEnroll({ userId: user.id, frames, fake: m.data.fake });
  if (!res.ok) return ok({ ok: false, hint: enrollHint(res.reason) });

  const reenrolled = hasFace(user);
  setFaceTemplate(user.id, res.templateEnc);
  await logEvent({ type: "bio_enrolled", userId: user.id, credentialId: session.credentialId, metadata: { reenrolled } });
  return ok({ ok: true });
});
