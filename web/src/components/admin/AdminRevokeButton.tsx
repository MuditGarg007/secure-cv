"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { errorMessage, withReauth } from "@/lib/webauthn-client";
import { Button } from "@/components/ui/button";

/** Admin revoke of one credential (admin+reauth; passkey check if reauth is stale). */
export function AdminRevokeButton({ credentialId, label }: { credentialId: string; label: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function revoke() {
    setBusy(true);
    try {
      await withReauth(() => api(`/api/admin/credentials/${credentialId}/revoke`, { method: "POST" }));
      toast.success(`${label} revoked.`);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
        <Trash2 /> Revoke
      </Button>
    );
  }
  return (
    <span className="flex gap-2">
      <Button variant="destructive" size="sm" onClick={revoke} disabled={busy}>
        Confirm revoke
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={busy}>
        Cancel
      </Button>
    </span>
  );
}
