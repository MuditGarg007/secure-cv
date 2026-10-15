"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Copy, Fingerprint, Hourglass, Printer, RotateCcw, ShieldCheck, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { BIG } from "@/components/common/PageShell";
import { VoiceButton } from "@/components/common/VoiceButton";
import { LivenessCheck } from "@/components/bio/LivenessCheck";
import { RECOVERY_POLL_MS } from "@/server/config";
import { api, ApiClientError } from "@/lib/api";
import { errorMessage, registerPasskey } from "@/lib/webauthn-client";

type RecoveryState = "pending_liveness" | "cooling_down" | "ready" | "completed" | "cancelled" | "expired";
type Status = {
  state: RecoveryState;
  method: "code_liveness" | "code_only";
  cooldownUntil?: string;
  serverNow: string;
};

/** Drives /recover/[id] from GET /api/recovery/:id (bound to this browser by the rec_bind cookie). */
export function RecoveryProgress({ recoveryId }: { recoveryId: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [skewMs, setSkewMs] = useState(0); // server clock − browser clock
  const [loadError, setLoadError] = useState<"not_found" | string | null>(null);
  const [newCode, setNewCode] = useState<string | null>(null);

  // Bump `reloads` to re-read the state (from handlers, timers and child callbacks).
  const [reloads, setReloads] = useState(0);
  const load = useCallback(() => setReloads((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    api<Status>(`/api/recovery/${recoveryId}`).then(
      (s) => {
        if (!alive) return;
        setSkewMs(Date.parse(s.serverNow) - Date.now());
        setStatus(s);
        setLoadError(null);
      },
      (e) => {
        if (!alive) return;
        setLoadError(e instanceof ApiClientError && e.code === "NOT_FOUND" ? "not_found" : errorMessage(e));
      },
    );
    return () => {
      alive = false;
    };
  }, [recoveryId, reloads]);

  // While cooling down, re-read now and then so a cancel from another device shows up here.
  const coolingDown = status?.state === "cooling_down";
  useEffect(() => {
    if (!coolingDown || newCode) return;
    const t = setInterval(load, RECOVERY_POLL_MS);
    return () => clearInterval(t);
  }, [coolingDown, newCode, load]);

  if (newCode) return <NewCodeStep code={newCode} />;
  if (loadError === "not_found") return <NotFoundStep />;
  if (loadError && !status) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }
  if (!status) return <Skeleton className="h-40 w-full" />;

  switch (status.state) {
    case "pending_liveness":
      return (
        <Step
          icon={<ShieldCheck />}
          title="Step 1 of 3: face check"
          voice="Show your face to the camera, then your own gesture and the hand sign you are asked for, next to your face."
        >
          <p>Show your face, then your own gesture and the hand sign you see, next to your face.</p>
          <LivenessCheck
            challengeUrl={`/api/recovery/${recoveryId}/liveness/challenge`}
            verifyUrl={`/api/recovery/${recoveryId}/liveness/verify`}
            onPassed={load}
            onFailedFinal={load}
          />
        </Step>
      );
    case "cooling_down":
      return (
        <CooldownStep
          until={Date.parse(status.cooldownUntil ?? status.serverNow)}
          skewMs={skewMs}
          withFace={status.method === "code_liveness"}
          onDone={load}
        />
      );
    case "ready":
      return <ReadyStep recoveryId={recoveryId} onDone={setNewCode} />;
    case "cancelled":
      return (
        <EndStep
          title="This recovery was cancelled"
          text="It was cancelled from a signed-in device, by an administrator, or because the face check failed too many times. If you still need access, start again."
        />
      );
    case "expired":
      return (
        <EndStep
          title="This recovery expired"
          text="Nothing happened here for 2 days, so we stopped it to keep your account safe. You can start again."
        />
      );
    case "completed":
      return (
        <EndStep title="This recovery is finished" text="Sign in with your new passkey." showStartOver={false} />
      );
  }
}

function Step({
  icon,
  title,
  voice,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  voice: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold [&_svg]:size-5">
          {icon}
          {title}
        </h2>
        <VoiceButton text={voice} />
      </div>
      {children}
    </section>
  );
}

function formatLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec.toString().padStart(2, "0")}s`;
}

function CooldownStep({
  until,
  skewMs,
  withFace,
  onDone,
}: {
  until: number;
  skewMs: number;
  withFace: boolean;
  onDone: () => void;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    let fired = false;
    const tick = () => {
      const n = Date.now() + skewMs;
      setNow(n);
      if (n >= until && !fired) {
        fired = true;
        onDone(); // server applies cooling_down → ready on the next read
      }
    };
    const t = setInterval(tick, 1000);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(t);
      clearTimeout(first);
    };
  }, [until, skewMs, onDone]);
  const left = now === null ? null : until - now;

  const when = new Date(until).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const text = `We alerted your signed-in devices. Come back on this browser after ${when}.`;
  return (
    <Step icon={<Hourglass />} title={`Step ${withFace ? 2 : 1} of ${withFace ? 3 : 2}: waiting time`} voice={text}>
      <div className="rounded-2xl border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">Time left</p>
        <p className="font-mono text-4xl font-semibold tabular-nums" aria-live="polite">
          {left === null ? "…" : formatLeft(left)}
        </p>
      </div>
      <p>
        We alerted your signed-in devices. Come back on <strong>this browser</strong> after{" "}
        <strong suppressHydrationWarning>{when}</strong>.
      </p>
      <p className="text-sm text-muted-foreground">
        This wait gives the real owner time to cancel if someone else started this. You can close this page; open
        the same link on this browser later.
      </p>
    </Step>
  );
}

function ReadyStep({ recoveryId, onDone }: { recoveryId: string; onDone: (code: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const r = await registerPasskey<{ ok: boolean; newRecoveryCode: string }>({
        optionsPath: `/api/recovery/${recoveryId}/complete/options`,
        verifyPath: `/api/recovery/${recoveryId}/complete/verify`,
      });
      onDone(r.newRecoveryCode);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Step
      icon={<Fingerprint />}
      title="Last step: new passkey"
      voice="The waiting time is over. Press Create new passkey. Your device will ask for your fingerprint, face or screen lock."
    >
      <p>
        The waiting time is over. Create a passkey on this device. Your device will ask for your fingerprint, face or
        screen lock.
      </p>
      <p className="text-sm text-muted-foreground">All your old passkeys and signed-in devices will be signed out.</p>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button className={BIG} disabled={busy} onClick={create}>
        <Fingerprint /> {busy ? "Waiting for your device…" : "Create new passkey"}
      </Button>
    </Step>
  );
}

function NewCodeStep({ code }: { code: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  return (
    <Step
      icon={<ShieldCheck />}
      title="You're back in"
      voice="You are back in. This is your new recovery code. Copy it or print it and keep it somewhere safe. Your old code no longer works."
    >
      <p className="print:hidden">
        This is your <strong>new recovery code</strong>. Your old code no longer works. Keep this one somewhere safe,
        not on this device only.
      </p>
      <p className="rounded-2xl border border-dashed border-primary/50 bg-card p-4 text-center font-mono text-xl font-semibold tracking-wider text-primary break-all">
        {code}
      </p>
      <div className="grid grid-cols-2 gap-2 print:hidden">
        <Button
          variant="outline"
          className={BIG}
          onClick={() =>
            navigator.clipboard.writeText(code).then(
              () => toast.success("Copied."),
              () => toast.error("Couldn't copy. Write it down instead."),
            )
          }
        >
          <Copy /> Copy
        </Button>
        <Button variant="outline" className={BIG} onClick={() => window.print()}>
          <Printer /> Print
        </Button>
      </div>
      <Label className="flex items-center gap-3 text-base print:hidden">
        <Checkbox checked={saved} onCheckedChange={(v) => setSaved(v === true)} />I saved my new recovery code
      </Label>
      <Button
        className={`${BIG} print:hidden`}
        disabled={!saved}
        onClick={() => {
          router.push("/home");
          router.refresh();
        }}
      >
        <ArrowRight /> Continue
      </Button>
    </Step>
  );
}

function EndStep({ title, text, showStartOver = true }: { title: string; text: string; showStartOver?: boolean }) {
  return (
    <Step icon={<ShieldX />} title={title} voice={`${title}. ${text}`}>
      <p>{text}</p>
      {showStartOver && (
        <Button className={BIG} nativeButton={false} render={<Link href="/recover" />}>
          <RotateCcw /> Start again
        </Button>
      )}
    </Step>
  );
}

function NotFoundStep() {
  return (
    <EndStep
      title="We can't find this recovery here"
      text="A recovery can only be continued on the browser that started it. Open this link on that browser, or start again."
    />
  );
}
