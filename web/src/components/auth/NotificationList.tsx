"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LocalTime } from "@/components/auth/LocalTime";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/webauthn-client";

export type NotificationItem = { id: string; text: string; createdAt: number };

export function NotificationList({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function markRead(ids: string[]) {
    setBusy(true);
    try {
      await api("/api/me/notifications/read", { method: "POST", json: { ids } });
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">No new alerts.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {items.map((n) => (
          <li key={n.id} className="flex items-start gap-3 rounded-lg border p-3">
            <Bell className="mt-0.5 size-4 shrink-0" />
            <div className="flex-1 text-sm">
              <p>{n.text}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                <LocalTime ms={n.createdAt} />
              </p>
            </div>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => markRead([n.id])}>
              <Check /> Mark read
            </Button>
          </li>
        ))}
      </ul>
      {items.length > 1 && (
        <Button variant="outline" disabled={busy} onClick={() => markRead(items.map((n) => n.id))}>
          Mark all read
        </Button>
      )}
    </div>
  );
}
