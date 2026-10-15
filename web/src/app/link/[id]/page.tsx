import { PageShell } from "@/components/common/PageShell";
import { LinkApprove } from "@/components/devices/LinkApprove";
import { getCurrentSession } from "@/server/auth/sessions";

export default async function LinkApprovePage({ params }: PageProps<"/link/[id]">) {
  const { id } = await params;
  const ctx = await getCurrentSession();
  return (
    <PageShell
      eyebrow="Device linking"
      title="Approve new device?"
      voiceText="Someone wants to add a device to your account. Only approve if the code is the same on the other screen."
    >
      {/* The nonce is in the URL fragment, so only the client can read it and build ?next=. */}
      <LinkApprove linkId={id} signedIn={!!ctx} stepUpPending={!!ctx?.session.stepUpPending} />
    </PageShell>
  );
}
