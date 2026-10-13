"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Loader2, RefreshCw } from "lucide-react";
import { api, ApiClientError } from "@/lib/api";
import { errorMessage, registerPasskey } from "@/lib/webauthn-client";
import { LINK_POLL_MS } from "@/server/config";
import { BIG } from "@/components/common/PageShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Start = { linkId: string; shortCode: string; qrUrl: string; expiresAt: number };
type Phase = "starting" | "waiting" | "registering" | "failed";

export function LinkNewDevice() {
  const router = useRouter();
  const [link, setLink] = useState<Start | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [message, setMessage] = useState<string | null>(null);
  const registering = useRef(false);
  const started = useRef(false);

  const start = useCallback(async () => {
    setPhase("starting");
    setMessage(null);
    setLink(null);
    setQr(null);
    registering.current = false;
    try {
      const s = await api<Start>("/api/link/start", { method: "POST" });
      setQr(await QRCode.toDataURL(s.qrUrl, { width: 280, margin: 1 }));
      setLink(s);
      setPhase("waiting");
    } catch (e) {
      setMessage(errorMessage(e));
      setPhase("failed");
    }
  }, []);

  useEffect(() => {
    // Once per mount (dev StrictMode runs effects twice; a second link would replace the cookie).
    if (started.current) return;
    started.current = true;
    void start();
  }, [start]);

  const register = useCallback(
    async (id: string) => {
      if (registering.current) return;
      registering.current = true;
      setPhase("registering");
      try {
        await registerPasskey({
          optionsPath: `/api/link/${id}/register/options`,
          verifyPath: `/api/link/${id}/register/verify`,
        });
        router.push("/home");
        router.refresh();
      } catch (e) {
        setMessage(errorMessage(e));
        setPhase("failed");
      }
    },
    [router],
  );

  useEffect(() => {
    if (phase !== "waiting" || !link) return;
    const t = setInterval(async () => {
      try {
        const { status } = await api<{ status: string }>(`/api/link/${link.linkId}/status`);
        if (status === "approved") {
          clearInterval(t);
          void register(link.linkId);
        } else if (status === "denied") {
          clearInterval(t);
          setMessage("The other device said no.");
          setPhase("failed");
        } else if (status === "consumed") {
          clearInterval(t);
          setMessage("This link was already used.");
          setPhase("failed");
        }
      } catch (e) {
        clearInterval(t);
        setMessage(
          e instanceof ApiClientError && e.code === "LINK_EXPIRED" ? "This code expired." : errorMessage(e),
        );
        setPhase("failed");
      }
    }, LINK_POLL_MS);
    return () => clearInterval(t);
  }, [phase, link, register]);

  if (phase === "failed") {
    return (
      <>
        <Alert variant="destructive">
          <AlertDescription>{message ?? "Something went wrong."}</AlertDescription>
        </Alert>
        <Button className={BIG} onClick={() => void start()}>
          <RefreshCw /> Try again
        </Button>
      </>
    );
  }

  if (phase === "registering") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <Loader2 className="size-8 animate-spin" />
        <p className="text-lg">Approved! Your device will ask for your fingerprint, face or screen lock.</p>
      </div>
    );
  }

  return (
    <>
      <ol className="list-decimal space-y-1 pl-5">
        <li>On your signed-in phone, open the camera and scan this code.</li>
        <li>Check that the same 6 digits show on the phone.</li>
        <li>Tap Approve on the phone.</li>
      </ol>
      <div className="flex justify-center">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL, nothing to optimise
          <img src={qr} alt="QR code to link this device" width={280} height={280} className="rounded-lg border" />
        ) : (
          <div className="flex size-[280px] items-center justify-center rounded-lg border">
            <Loader2 className="size-8 animate-spin" />
          </div>
        )}
      </div>
      {link && (
        <p className="text-center font-mono text-4xl font-bold tracking-[0.3em]" aria-label="Your code">
          {link.shortCode.slice(0, 3)} {link.shortCode.slice(3)}
        </p>
      )}
      <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Waiting for approval…
      </p>
    </>
  );
}
