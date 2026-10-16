"use client";
import { useState } from "react";
import { Check, Fingerprint, ScanFace, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BIG } from "@/components/common/PageShell";
import { LivenessCheck } from "@/components/bio/LivenessCheck";
import { api, ApiClientError } from "@/lib/api";
import { errorMessage, reauth, withReauth } from "@/lib/webauthn-client";
import type { AuthorizeParams } from "@/server/oauth/params";

type Props = {
  params: AuthorizeParams;
  clientName: string;
  handle: string;
  displayName: string;
  enrolled: boolean;
};

function answer(params: AuthorizeParams, decision: "approve" | "deny") {
  return api<{ redirect: string }>("/api/oauth/approve", { method: "POST", json: { ...params, decision } });
}

export function AuthorizeClient({ params, clientName, handle, displayName, enrolled }: Props) {
  const strong = params.acr_values === "liveness";
  const [phase, setPhase] = useState<"ready" | "liveness" | "failed">(strong && !enrolled ? "failed" : "ready");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ redirect: string } | void>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if (res) window.location.assign(res.redirect);
    } catch (e) {
      if (!(e instanceof ApiClientError && e.code === "CANCELLED")) setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const approve = () =>
    run(async () => {
      if (!strong) return withReauth(() => answer(params, "approve"));
      await reauth(); // fresh passkey first, then the face + gesture check
      setPhase("liveness");
    });
  const deny = () => run(() => answer(params, "deny"));

  return (
    <div className="flex flex-col gap-4">
      {params.binding_message && (
        <Alert>
          <AlertTitle>{clientName} asks you to approve</AlertTitle>
          <AlertDescription className="text-base font-semibold text-foreground">
            {params.binding_message}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>
            Signed in to Secure as <strong>{displayName}</strong> <span className="text-fg-3">@{handle}</span>
          </p>
          <p className="text-fg-3">
            {clientName} will learn your username and name, and that you confirmed with{" "}
            {strong ? "your passkey and a face + gesture check" : "your passkey"}. It never sees your passkey or
            your face.
          </p>
          <p className="text-fg-3">Only continue if you started this on {clientName} just now.</p>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {phase === "failed" && (
        <Alert variant="destructive">
          <AlertTitle>We couldn&apos;t confirm it&apos;s you</AlertTitle>
          <AlertDescription>
            {enrolled
              ? "The face and gesture check didn't pass, so this request can't be approved."
              : "This needs a face and gesture check, which isn't set up for your account. Add it under Security first."}
          </AlertDescription>
        </Alert>
      )}

      {phase === "liveness" && (
        <LivenessCheck
          challengeUrl="/api/oauth/liveness/challenge"
          verifyUrl="/api/oauth/liveness/verify"
          onPassed={() => run(() => answer(params, "approve"))}
          onFailedFinal={() => setPhase("failed")}
        />
      )}

      {phase === "ready" && (
        <Button className={BIG} disabled={busy} onClick={approve}>
          {strong ? <ScanFace /> : <Fingerprint />}
          {busy ? "Waiting for your device…" : strong ? "Approve with passkey + face" : "Continue with passkey"}
        </Button>
      )}
      <Button className={BIG} variant="ghost" disabled={busy} onClick={deny}>
        {phase === "failed" ? <Check /> : <X />} {phase === "failed" ? `Back to ${clientName}` : "Deny"}
      </Button>
    </div>
  );
}
