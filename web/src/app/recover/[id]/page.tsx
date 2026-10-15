import { PageShell } from "@/components/common/PageShell";
import { RecoveryProgress } from "../_components/RecoveryProgress";

export default async function RecoveryProgressPage({ params }: PageProps<"/recover/[id]">) {
  const { id } = await params;
  return (
    <PageShell eyebrow="Account recovery" title="Recover your account" voiceText="Account recovery. Follow the steps on this screen.">
      <RecoveryProgress recoveryId={id} />
    </PageShell>
  );
}
