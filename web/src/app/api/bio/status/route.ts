import { route, ok, ApiError } from "@/server/http";
import { bioStatus } from "@/server/bio/client";

// GET /api/bio/status → {available, fake}. Lets the capture UI offer the dev pass/fail picker
// (and a stand-in camera) only while bio runs with BIO_FAKE=1. Reveals nothing else.
export const GET = route(async () => {
  try {
    const { fake } = await bioStatus();
    return ok({ available: true, fake });
  } catch (e) {
    if (e instanceof ApiError && e.code === "BIO_UNAVAILABLE") return ok({ available: false, fake: false });
    throw e;
  }
});
