import { redirect } from "next/navigation";
import { env } from "@/server/env";
import { getCurrentSession } from "@/server/auth/sessions";
import { safeNext } from "@/server/auth/safe-next";
import { PageShell } from "@/components/common/PageShell";
import { SignInPanel } from "./_components/SignInPanel";

export default async function SignInPage({ searchParams }: PageProps<"/signin">) {
  const next = safeNext((await searchParams).next);
  const ctx = await getCurrentSession();
  if (ctx && !ctx.session.stepUpPending) redirect(next ?? "/home");
  return (
    <PageShell
      title="Sign in"
      voiceText="Sign in with your passkey. Your device will ask for your fingerprint, face or screen lock. No password needed."
    >
      <SignInPanel next={next} debugRisk={env.DEBUG_RISK === "1"} />
    </PageShell>
  );
}
