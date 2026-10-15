import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/common/PageShell";
import { EventList } from "@/components/events/EventList";
import { AdminRevokeButton } from "@/components/admin/AdminRevokeButton";
import { AdminRecoveryRequests } from "@/components/recovery/AdminRecoveryRequests";
import { Badge } from "@/components/ui/badge";
import { requirePageSession } from "@/server/auth/sessions";
import { getUserById, hasFace } from "@/server/users";
import { listDevices, REVOKE_REASON_TEXT } from "@/server/devices/devices";
import { listEvents } from "@/server/devices/events";
import { labelFromUA } from "@/lib/ua";

const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

export default async function AdminUserPage({ params }: PageProps<"/admin/users/[id]">) {
  const { id } = await params;
  await requirePageSession({ admin: true, next: `/admin/users/${id}` });
  const user = getUserById(id);
  if (!user) notFound();
  const { active, removed } = listDevices(user.id);
  const events = listEvents({ userId: user.id });

  return (
    <PageShell eyebrow="Admin · User" title={`@${user.handle}`} voiceText={`Account of ${user.displayName}.`} wide>
      <Link href="/admin" className="text-sm underline">
        ← All users
      </Link>
      <p>
        {user.displayName} · joined {fmt.format(user.createdAt)} · face {hasFace(user) ? "enrolled" : "not enrolled"}
      </p>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Active devices</h2>
        {active.length === 0 ? (
          <p className="text-muted-foreground">None.</p>
        ) : (
          <ul className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card text-sm">
            {active.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span>
                  <span className="font-medium">{d.label}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · added {fmt.format(d.createdAt)}
                    {d.lastUsedAt && ` · last used ${fmt.format(d.lastUsedAt)}`}
                    {d.lastUsedUa && ` on ${labelFromUA(d.lastUsedUa)}`}
                  </span>
                </span>
                <AdminRevokeButton credentialId={d.id} label={d.label} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Removed devices</h2>
        {removed.length === 0 ? (
          <p className="text-muted-foreground">None.</p>
        ) : (
          <ul className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card text-sm">
            {removed.map((d) => (
              <li key={d.id} className="flex flex-wrap justify-between gap-2 p-3">
                <span className="line-through">{d.label}</span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  {d.revokedReason && <Badge variant="outline">{REVOKE_REASON_TEXT[d.revokedReason]}</Badge>}
                  {d.revokedAt && fmt.format(d.revokedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Recovery requests</h2>
        <AdminRecoveryRequests userId={user.id} />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Events</h2>
        <EventList events={events} admin />
      </section>
    </PageShell>
  );
}
