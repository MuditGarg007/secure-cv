import { PageShell } from "@/components/common/PageShell";
import { LinkNewDevice } from "@/components/devices/LinkNewDevice";

export default function LinkPage() {
  return (
    <PageShell
      title="Add this device"
      voiceText="Scan this code with your signed-in phone. Then check that the six digit code is the same on both screens."
    >
      <LinkNewDevice />
    </PageShell>
  );
}
