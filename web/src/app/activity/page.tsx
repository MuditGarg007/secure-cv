import { PageShell } from "@/components/common/PageShell";
import { EventList } from "@/components/events/EventList";
import { requirePageSession } from "@/server/auth/sessions";
import { listEvents } from "@/server/devices/events";

export default async function ActivityPage() {
  const { user } = await requirePageSession({ next: "/activity" });
  const events = listEvents({ userId: user.id });
  return (
    <PageShell title="Activity" voiceText="Your recent sign-ins and device changes. Newest first.">
      <p className="text-sm text-muted-foreground">✓ allowed · ⚠ extra check · ⛔ blocked · 🔑 device change</p>
      <EventList events={events} />
    </PageShell>
  );
}
