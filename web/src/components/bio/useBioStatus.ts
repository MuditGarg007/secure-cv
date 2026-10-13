"use client";
import { useEffect, useState } from "react";

export type BioStatus = { available: boolean; fake: boolean };

/** GET /api/bio/status once. `fake` = bio runs with BIO_FAKE=1 (dev picker + stand-in camera). */
export function useBioStatus(): BioStatus | null {
  const [status, setStatus] = useState<BioStatus | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/bio/status", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d: BioStatus) => alive && setStatus({ available: !!d.available, fake: !!d.fake }))
      .catch(() => alive && setStatus({ available: false, fake: false }));
    return () => {
      alive = false;
    };
  }, []);
  return status;
}
