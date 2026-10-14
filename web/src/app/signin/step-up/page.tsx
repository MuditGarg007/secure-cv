import { redirect } from "next/navigation";
import { PageShell } from "@/components/common/PageShell";
import { getCurrentSession } from "@/server/auth/sessions";
import { hasFace } from "@/server/users";
import { stepUpReasonText } from "@/server/bio/rules";
import { stepUpOrigin } from "@/server/bio/store";
import { StepUpClient } from "./StepUpClient";

// /signin/step-up: liveness check for a passkey sign-in that looked risky (docs/flows.md §3).
export default async function StepUpPage() {
  const ctx = await getCurrentSession();
  if (!ctx) redirect("/signin");
  if (!ctx.session.stepUpPending) redirect("/home");

  const reason = stepUpReasonText(stepUpOrigin(ctx.session).signals);
  const intro = `This sign-in looks unusual (${reason}). Quick check: show your gesture and one hand sign next to your face.`;
  return (
    <PageShell title="Quick check" voiceText={intro}>
      <p>
        This sign-in looks unusual (<strong>{reason}</strong>). Quick check to make sure it&apos;s you.
      </p>
      <StepUpClient enrolled={hasFace(ctx.user)} />
    </PageShell>
  );
}
