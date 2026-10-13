"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { api } from "@/lib/api";
import { authenticatePasskey, errorMessage } from "@/lib/webauthn-client";
import { BIG } from "@/components/common/PageShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Info = { shortCode: string; ua: string; createdAt: number };
type State =
  | { kind: "loading" }
  | { kind: "ready"; nonce: string; info: Info }
  | { kind: "busy"; nonce: string; info: Info }
  | { kind: "done"; approved: boolean }
  | { kind: "error"; message: string };

export function LinkApprove({
  linkId,
  signedIn,
  stepUpPending,
}: {
  linkId: string;
  signedIn: boolean;
  stepUpPending: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const nonce = window.location.hash.slice(1);
    const here = `/link/${linkId}${window.location.hash}`;
    if (!signedIn) {
      router.replace(`/signin?next=${encodeURIComponent(here)}`);
      return;
    }
    if (stepUpPending) {
      router.replace("/signin/step-up");
      return;
    }
    if (!nonce) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hash is only readable after mount
      setState({ kind: "error", message: "This link is incomplete. Scan the QR code again." });
      return;
    }
    api<Info>(`/api/link/${linkId}?n=${encodeURIComponent(nonce)}`)
      .then((info) => setState({ kind: "ready", nonce, info }))
      .catch((e) => setState({ kind: "error", message: errorMessage(e) }));
  }, [linkId, signedIn, stepUpPending, router]);

  async function decide(decision: "approve" | "deny") {
    if (state.kind !== "ready") return;
    setState({ ...state, kind: "busy" });
    try {
      await authenticatePasskey({
        optionsPath: `/api/link/${linkId}/approve/options`,
        verifyPath: `/api/link/${linkId}/approve/verify`,
        optionsBody: { nonce: state.nonce },
        verifyBody: { decision },
      });
      setState({ kind: "done", approved: decision === "approve" });
    } catch (e) {
      setState({ kind: "error", message: errorMessage(e) });
    }
  }

  if (state.kind === "loading") {
    return <Loader2 className="mx-auto size-8 animate-spin" />;
  }
  if (state.kind === "error") {
    return (
      <Alert variant="destructive">
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  }
  if (state.kind === "done") {
    return (
      <Alert>
        <AlertDescription className="text-base">
          {state.approved
            ? "Approved. Finish on the other device: it will ask for its fingerprint, face or screen lock."
            : "Denied. The other device was not added."}
        </AlertDescription>
      </Alert>
    );
  }

  const { info } = state;
  const busy = state.kind === "busy";
  return (
    <>
      <p>A new device wants to join your account:</p>
      <p className="text-center text-lg font-medium">{info.ua}</p>
      <p className="text-center font-mono text-4xl font-bold tracking-[0.3em]">
        {info.shortCode.slice(0, 3)} {info.shortCode.slice(3)}
      </p>
      <p className="text-center text-lg">Is the same code on the other screen?</p>
      <Button className={BIG} onClick={() => decide("approve")} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Check />} Yes, approve
      </Button>
      <Button className={BIG} variant="destructive" onClick={() => decide("deny")} disabled={busy}>
        <X /> No, deny
      </Button>
      <p className="text-sm text-muted-foreground">
        If you didn&apos;t start this, tap Deny. Nobody from support will ever ask you to approve a device.
      </p>
    </>
  );
}
