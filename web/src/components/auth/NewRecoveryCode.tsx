"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BIG } from "@/components/common/PageShell";
import { RecoveryCodeCard } from "@/components/auth/RecoveryCodeCard";
import { api } from "@/lib/api";
import { errorMessage, withReauth } from "@/lib/webauthn-client";

/** /security: issue a new recovery code (needs a fresh passkey check), show it once. */
export function NewRecoveryCode({ hasCode }: { hasCode: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const res = await withReauth(() => api<{ code: string }>("/api/me/recovery-code", { method: "POST" }));
      setCode(res.code);
      setConfirming(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (code) {
    return (
      <RecoveryCodeCard
        code={code}
        doneLabel="Done"
        onDone={() => {
          setCode(null);
          toast.success("New recovery code saved.");
          router.refresh();
        }}
      />
    );
  }
  if (confirming) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <p className="text-sm">
          Your old recovery code will stop working. Your device will ask for your fingerprint, face or screen lock
          first.
        </p>
        <Button className={BIG} disabled={busy} onClick={generate}>
          <KeyRound /> {busy ? "Waiting for your device…" : "Yes, make a new code"}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        {hasCode
          ? "You have a recovery code. Make a new one if you lost it or someone else saw it."
          : "You don't have a recovery code. Make one now so you can get back in if you lose your devices."}
      </p>
      <Button className={BIG} variant={hasCode ? "outline" : "default"} onClick={() => setConfirming(true)}>
        <KeyRound /> New recovery code
      </Button>
    </div>
  );
}
