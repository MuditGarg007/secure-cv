import { redirect } from "next/navigation";
import { env } from "@/server/env";
import { getCurrentSession } from "@/server/auth/sessions";
import { SignupWizard } from "@/components/auth/SignupWizard";

export default async function SignupPage() {
  const ctx = await getCurrentSession();
  if (ctx && !ctx.session.stepUpPending) redirect("/home");
  return <SignupWizard debugRisk={env.DEBUG_RISK === "1"} />;
}
