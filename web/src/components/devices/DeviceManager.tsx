"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Pencil, QrCode, Smartphone, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { errorMessage, registerPasskey, withReauth } from "@/lib/webauthn-client";
import { BIG } from "@/components/common/PageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ActiveDevice = {
  id: string;
  label: string;
  createdAt: number;
  lastUsedAt: number | null;
  lastUsedOn: string | null;
  current: boolean;
};
export type RemovedDevice = { id: string; label: string; revokedAt: number; reason: string };

const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });
const day = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

export function DeviceManager({
  active,
  removed,
  linkUrl,
}: {
  active: ActiveDevice[];
  removed: RemovedDevice[];
  linkUrl: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<ActiveDevice | null>(null);
  const [showLink, setShowLink] = useState(false);

  async function addKey() {
    setBusy(true);
    try {
      await withReauth(() =>
        registerPasskey({ optionsPath: "/api/devices/key/options", verifyPath: "/api/devices/key/verify" }),
      );
      toast.success("Security key added.");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(reason: "lost" | "user") {
    const d = removing;
    if (!d) return;
    setBusy(true);
    try {
      const res = await withReauth(() =>
        api<{ ok: boolean; signedOut: boolean }>(`/api/devices/${d.id}/revoke`, { method: "POST", json: { reason } }),
      );
      setRemoving(null);
      if (res.signedOut) {
        router.push("/");
        router.refresh();
        return;
      }
      toast.success(`${d.label} removed.`);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ul className="flex flex-col gap-3">
        {active.map((d) => (
          <DeviceCard key={d.id} device={d} onRemove={() => setRemoving(d)} disabled={busy} />
        ))}
      </ul>

      <Button className={BIG} onClick={() => setShowLink(true)} disabled={busy}>
        <QrCode /> Add a device
      </Button>
      <Button className={BIG} variant="outline" onClick={addKey} disabled={busy}>
        <KeyRound /> Add card or security key
      </Button>

      {removed.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-2 text-lg font-semibold">Removed devices</h2>
          <ul className="flex flex-col divide-y rounded-lg border text-sm">
            {removed.map((d) => (
              <li key={d.id} className="flex flex-wrap justify-between gap-2 p-3 text-muted-foreground">
                <span className="line-through">{d.label}</span>
                <span>
                  {d.reason} · {day.format(d.revokedAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.label}?</DialogTitle>
            <DialogDescription>
              It will no longer be able to sign in.
              {removing?.current && " This is the device you are using now, so you will be signed out."}
            </DialogDescription>
          </DialogHeader>
          <Button className={BIG} variant="destructive" onClick={() => revoke("lost")} disabled={busy}>
            I lost it
          </Button>
          <Button className={BIG} variant="outline" onClick={() => revoke("user")} disabled={busy}>
            I don&apos;t use it anymore
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={showLink} onOpenChange={setShowLink}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a device</DialogTitle>
            <DialogDescription>On the NEW device, open this address:</DialogDescription>
          </DialogHeader>
          <p className="rounded-md bg-muted p-3 text-center font-mono text-base break-all">{linkUrl}</p>
          <p>It shows a QR code. Scan it with this phone&apos;s camera and check that the 6-digit code matches.</p>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DeviceCard({ device: d, onRemove, disabled }: { device: ActiveDevice; onRemove: () => void; disabled: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(d.label);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/api/devices/${d.id}`, { method: "PATCH", json: { label } });
      setEditing(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <li>
      <Card>
        <CardContent className="flex flex-col gap-2">
          {editing ? (
            <form onSubmit={save} className="flex gap-2">
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={60}
                aria-label="Device name"
                autoFocus
              />
              <Button type="submit" disabled={saving || !label.trim()}>
                Save
              </Button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <Smartphone className="size-5 shrink-0" />
              <span className="font-medium">{d.label}</span>
              {d.current && <Badge>This device</Badge>}
            </div>
          )}
          <div className="text-sm text-muted-foreground">
            Added {day.format(d.createdAt)}
            {d.lastUsedAt && ` · Last used ${fmt.format(d.lastUsedAt)}`}
            {d.lastUsedOn && ` on ${d.lastUsedOn}`}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(!editing)} disabled={disabled}>
              <Pencil /> {editing ? "Cancel" : "Rename"}
            </Button>
            <Button variant="destructive" size="sm" onClick={onRemove} disabled={disabled}>
              <Trash2 /> Remove
            </Button>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
