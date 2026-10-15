"use client";
import { useState } from "react";
import { Copy, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { BIG } from "@/components/common/PageShell";

/**
 * Shows a freshly issued recovery code once, with Copy / Print, and requires the
 * "I saved it" checkbox before `onDone`.
 */
export function RecoveryCodeCard({
  code,
  onDone,
  doneLabel = "Continue",
}: {
  code: string;
  onDone: () => void;
  doneLabel?: string;
}) {
  const [saved, setSaved] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Copied. Paste it somewhere safe.");
    } catch {
      toast.error("Couldn't copy. Write it down instead.");
    }
  }

  function print() {
    const w = window.open("", "_blank", "width=480,height=320");
    if (!w) return;
    const doc = w.document;
    doc.title = "Recovery code";
    const h = doc.createElement("h2");
    h.textContent = "Secure: account recovery code";
    const p = doc.createElement("p");
    p.textContent = code;
    p.style.cssText = "font:600 24px monospace;letter-spacing:2px";
    const n = doc.createElement("p");
    n.textContent = "Keep this paper safe. Anyone with this code and your face can start recovering your account.";
    doc.body.append(h, p, n);
    w.focus();
    w.print();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="dot-grid rounded-2xl border border-dashed border-primary/50 bg-card p-5 text-center">
        <p className="mono-label mb-3">[ Your recovery code ]</p>
        <p className="font-mono text-xl font-semibold tracking-wider break-all text-primary select-all" data-testid="recovery-code">
          {code}
        </p>
      </div>
      <p className="text-sm">
        This is the only way back into your account if you lose every device. We show it once. Write it down
        or print it, and keep it somewhere safe.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-11" onClick={copy}>
          <Copy /> Copy
        </Button>
        <Button variant="outline" className="h-11" onClick={print}>
          <Printer /> Print
        </Button>
      </div>
      <label className="flex items-center gap-3 text-base">
        <Checkbox checked={saved} onCheckedChange={(v) => setSaved(v === true)} />I saved my recovery code
      </label>
      <Button className={BIG} disabled={!saved} onClick={onDone}>
        {doneLabel}
      </Button>
    </div>
  );
}
