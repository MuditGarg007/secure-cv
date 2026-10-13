"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BIG } from "@/components/common/PageShell";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/webauthn-client";

export function RecoverStartForm() {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // The server normalizes the code (case, dashes, spaces, I/L/O look-alikes).
      const { recoveryId } = await api<{ recoveryId: string; next: "liveness" | "cooldown" }>(
        "/api/recovery/start",
        { json: { handle: handle.trim(), code } },
      );
      router.push(`/recover/${recoveryId}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="handle">Account name</Label>
        <Input
          id="handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          className="h-12 text-base"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="code">Recovery code</Label>
        <Input
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="h-12 font-mono text-base uppercase"
          required
        />
        <p className="text-xs text-muted-foreground">Dashes, spaces and small letters are fine.</p>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className={BIG} disabled={busy || !handle || !code}>
        <KeyRound /> {busy ? "Checking…" : "Start recovery"}
      </Button>
    </form>
  );
}
