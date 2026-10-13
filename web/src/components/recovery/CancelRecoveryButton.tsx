"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BIG } from "@/components/common/PageShell";
import { api } from "@/lib/api";
import { errorMessage, withReauth } from "@/lib/webauthn-client";

/**
 * Cancel a recovery request. `admin` → admin route behind a fresh passkey check;
 * otherwise the owner's own session.
 */
export function CancelRecoveryButton({ recoveryId, admin = false }: { recoveryId: string; admin?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);
    try {
      if (admin) {
        await withReauth(() => api(`/api/admin/recovery/${recoveryId}/cancel`, { method: "POST" }));
      } else {
        await api(`/api/recovery/${recoveryId}/cancel`, { method: "POST" });
      }
      toast.success("Recovery cancelled.");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return admin ? (
    <Button variant="destructive" size="sm" disabled={busy} onClick={cancel}>
      <XCircle /> Cancel
    </Button>
  ) : (
    <Button variant="destructive" className={BIG} disabled={busy} onClick={cancel}>
      <XCircle /> Cancel this recovery
    </Button>
  );
}
