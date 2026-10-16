"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Fingerprint, LifeBuoy, ShieldAlert, Smartphone } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BIG } from "@/components/common/PageShell";
import { SimulateLocation } from "@/components/auth/SimulateLocation";
import { debugHeaders, useDebugCountry, useHydrated } from "@/components/auth/debug-country";
import { ApiClientError } from "@/lib/api";
import { authenticatePasskey, errorMessage } from "@/lib/webauthn-client";

type LoginResult = { status: "ok" } | { status: "step_up"; reason: string };

const PATHS = { optionsPath: "/api/auth/login/options", verifyPath: "/api/auth/login/verify" };
const BLOCKED_TEXT = "We stopped this sign-in. Check your other devices.";

export function SignInPanel({ next, debugRisk }: { next: string | null; debugRisk: boolean }) {
  const router = useRouter();
  const country = useDebugCountry();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  function done(res: LoginResult) {
    if (res.status === "step_up") router.replace(next ? `/signin/step-up?next=${encodeURIComponent(next)}` : "/signin/step-up");
    else router.replace(next ?? "/home");
    router.refresh();
  }

  function fail(e: unknown) {
    if (e instanceof ApiClientError && e.code === "BLOCKED") {
      setBlocked(true);
      setError(null);
    } else if (!(e instanceof ApiClientError && e.code === "CANCELLED")) {
      setBlocked(false);
      setError(errorMessage(e));
    }
  }

  // Conditional UI: passkeys offered in the username field's autofill. Restarted when the
  // simulated country changes so the header matches; a button ceremony aborts it.
  useEffect(() => {
    // Wait for hydration so the header uses the stored country, not the SSR default.
    if (!hydrated) return;
    let live = true;
    (async () => {
      if (!window.PublicKeyCredential?.isConditionalMediationAvailable) return;
      if (!(await PublicKeyCredential.isConditionalMediationAvailable())) return;
      try {
        const res = await authenticatePasskey<LoginResult>({
          ...PATHS,
          autofill: true,
          headers: debugHeaders(debugRisk, country),
        });
        if (live) done(res);
      } catch (e) {
        // Aborted autofill (button pressed, page left) is expected; show real failures only.
        if (live && e instanceof ApiClientError && e.status > 0) fail(e);
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, debugRisk, hydrated]);

  async function signIn() {
    setBusy(true);
    setError(null);
    setBlocked(false);
    try {
      done(await authenticatePasskey<LoginResult>({ ...PATHS, headers: debugHeaders(debugRisk, country) }));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {blocked && (
        <Alert variant="destructive">
          <ShieldAlert />
          <AlertTitle>{BLOCKED_TEXT}</AlertTitle>
          <AlertDescription>
            This sign-in looked unusual. If it was you, sign in from a device you&apos;ve used before.
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          className="h-11 text-base"
          autoComplete="username webauthn"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Tap to pick your passkey"
        />
      </div>

      <Button className={BIG} disabled={busy} onClick={signIn}>
        <Fingerprint /> {busy ? "Waiting for your device…" : "Sign in with passkey"}
      </Button>
      <Button className={BIG} variant="outline" disabled={busy} onClick={signIn}>
        <Smartphone /> Use phone or security key
      </Button>
      <p className="text-muted-foreground -mt-2 text-xs">
        Your browser shows a QR code for your phone, or asks you to tap your security key.
      </p>

      <Button className={BIG} variant="ghost" nativeButton={false} render={<Link href="/recover" />}>
        <LifeBuoy /> Lost my device?
      </Button>
      <p className="text-center text-sm">
        New here?{" "}
        <Link href="/signup" className="underline">
          Create an account
        </Link>
      </p>

      {debugRisk && <SimulateLocation />}
    </div>
  );
}
