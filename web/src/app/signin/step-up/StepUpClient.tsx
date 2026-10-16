"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogIn, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { BIG } from "@/components/common/PageShell";
import { LivenessCheck } from "@/components/bio/LivenessCheck";
import { api } from "@/lib/api";

async function signOut() {
  await api("/api/auth/logout", { method: "POST" }).catch(() => {});
}

export function StepUpClient({ enrolled, next }: { enrolled: boolean; next: string | null }) {
  const router = useRouter();
  const [ended, setEnded] = useState(!enrolled);

  if (ended) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="destructive">
          <AlertTitle>We stopped this sign-in</AlertTitle>
          <AlertDescription>
            {enrolled
              ? "We couldn't confirm it's you, so this browser is signed out. If it was you, try again from a device you usually use, or check your other devices."
              : "Face check isn't set up for this account, so unusual sign-ins are blocked. Sign in from a device you usually use."}
          </AlertDescription>
        </Alert>
        <Button className={BIG} render={<Link href="/signin" />} nativeButton={false}>
          <LogIn /> Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <LivenessCheck
        challengeUrl="/api/stepup/challenge"
        verifyUrl="/api/stepup/verify"
        onPassed={() => {
          toast.success("Verified. Welcome back.");
          router.replace(next ?? "/home");
          router.refresh();
        }}
        onFailedFinal={() => {
          // Out of attempts ends the session server-side; sign out anyway for any other final error.
          // No router.refresh(): it would re-render this page without a session and redirect away
          // before the user reads why.
          void signOut();
          toast.error("Sign-in stopped.");
          setEnded(true);
        }}
      />
      <Button
        variant="ghost"
        className={BIG}
        onClick={async () => {
          await signOut();
          router.replace("/");
          router.refresh();
        }}
      >
        <X /> Cancel sign-in
      </Button>
    </div>
  );
}
