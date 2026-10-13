import { PageShell } from "@/components/common/PageShell";
import { DeviceManager } from "@/components/devices/DeviceManager";
import { requirePageSession } from "@/server/auth/sessions";
import { env } from "@/server/env";
import { listDevices, REVOKE_REASON_TEXT } from "@/server/devices/devices";
import { labelFromUA } from "@/lib/ua";

export default async function DevicesPage() {
  const { session, user } = await requirePageSession({ next: "/devices" });
  const { active, removed } = listDevices(user.id);
  return (
    <PageShell title="Your devices" voiceText="These devices can sign in to your account. Remove any you lost.">
      <DeviceManager
        linkUrl={`${env.ORIGIN}/link`}
        active={active.map((d) => ({
          id: d.id,
          label: d.label,
          createdAt: d.createdAt,
          lastUsedAt: d.lastUsedAt,
          lastUsedOn: d.lastUsedUa ? labelFromUA(d.lastUsedUa) : null,
          current: d.id === session.credentialId,
        }))}
        removed={removed.map((d) => ({
          id: d.id,
          label: d.label,
          revokedAt: d.revokedAt!,
          reason: d.revokedReason ? REVOKE_REASON_TEXT[d.revokedReason] : "Removed",
        }))}
      />
    </PageShell>
  );
}
