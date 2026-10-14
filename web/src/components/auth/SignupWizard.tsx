"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Fingerprint } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BIG, PageShell } from "@/components/common/PageShell";
import { FaceEnrollPanel } from "@/components/bio/FaceEnrollPanel";
import { RecoveryCodeCard } from "@/components/auth/RecoveryCodeCard";
import { debugHeaders, useDebugCountry } from "@/components/auth/debug-country";
import { api, ApiClientError } from "@/lib/api";
import { errorMessage, registerPasskey, withReauth } from "@/lib/webauthn-client";

// docs/flows.md §1: (1) handle + name, (2) passkey, (3) face (skippable), (4) recovery code, (5) /home.

type Step = "details" | "passkey" | "face" | "code";

const STEPS: Record<Step, { n: number; title: string; voice: string }> = {
  details: {
    n: 1,
    title: "Create your account",
    voice: "Choose a username and type your name. No password needed.",
  },
  passkey: {
    n: 2,
    title: "Create your passkey",
    voice: "Your device will ask for your fingerprint, face or screen lock. That is your key to sign in.",
  },
  face: {
    n: 3,
    title: "Add a face check",
    voice:
      "Add a face check. We use it only when a sign-in looks unusual, and to help you recover your account. You can skip this.",
  },
  code: {
    n: 4,
    title: "Save your recovery code",
    voice:
      "This is your recovery code. Write it down or print it and keep it safe. You need it if you lose every device.",
  },
};

const HANDLE_RE = /^[a-z0-9_]{3,32}$/;

export function SignupWizard({ debugRisk }: { debugRisk: boolean }) {
  const router = useRouter();
  const country = useDebugCountry();
  const [step, setStep] = useState<Step>("details");
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);

  const handleOk = HANDLE_RE.test(handle);
  const nameOk = displayName.trim().length > 0 && displayName.trim().length <= 64;

  async function createPasskey() {
    setBusy(true);
    setError(null);
    try {
      await registerPasskey({
        optionsPath: "/api/auth/register/options",
        verifyPath: "/api/auth/register/verify",
        optionsBody: { handle, displayName: displayName.trim() },
        headers: debugHeaders(debugRisk, country),
      });
      setStep("face");
    } catch (e) {
      if (e instanceof ApiClientError && e.code === "HANDLE_TAKEN") {
        setStep("details");
        setError("That username is taken. Try another one.");
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  }

  async function issueCode() {
    setBusy(true);
    setError(null);
    setStep("code");
    try {
      const res = await withReauth(() => api<{ code: string }>("/api/me/recovery-code", { method: "POST" }));
      setCode(res.code);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const s = STEPS[step];
  return (
    <PageShell title={s.title} voiceText={s.voice}>
      <p className="text-muted-foreground text-sm">Step {s.n} of 4</p>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {step === "details" && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!handleOk || !nameOk) return;
            setError(null);
            setStep("passkey");
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="handle">Username</Label>
            <Input
              id="handle"
              className="h-11 text-base"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase().trim())}
              aria-invalid={handle.length > 0 && !handleOk}
              required
            />
            <p className="text-muted-foreground text-xs">3 to 32 letters, numbers or _</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="displayName">Your name</Label>
            <Input
              id="displayName"
              className="h-11 text-base"
              autoComplete="name"
              maxLength={64}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className={BIG} disabled={!handleOk || !nameOk}>
            Continue
          </Button>
          <p className="text-center text-sm">
            Already have an account?{" "}
            <Link href="/signin" className="underline">
              Sign in
            </Link>
          </p>
        </form>
      )}

      {step === "passkey" && (
        <div className="flex flex-col gap-4">
          <p>
            Your device will ask for your <strong>fingerprint, face or screen lock</strong>. That creates a passkey
            for <strong>{handle}</strong>. There is no password to remember or leak.
          </p>
          <p className="text-muted-foreground text-sm">
            No fingerprint reader? You can use your phone (scan a QR code) or a security key.
          </p>
          <Button className={BIG} disabled={busy} onClick={createPasskey}>
            <Fingerprint /> {busy ? "Waiting for your device…" : "Create my passkey"}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setStep("details")}>
            Back
          </Button>
        </div>
      )}

      {step === "face" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            We check your face and a hand gesture you choose only when a sign-in looks unusual, and to help you recover
            your account. Your photos are never stored.
          </p>
          <FaceEnrollPanel allowSkip onDone={() => issueCode()} />
        </div>
      )}

      {step === "code" &&
        (code ? (
          <RecoveryCodeCard
            code={code}
            doneLabel="Go to my account"
            onDone={() => {
              router.replace("/home");
              router.refresh();
            }}
          />
        ) : busy ? (
          <p className="text-muted-foreground">Making your recovery code…</p>
        ) : (
          <Button className={BIG} onClick={issueCode}>
            Try again
          </Button>
        ))}
    </PageShell>
  );
}
