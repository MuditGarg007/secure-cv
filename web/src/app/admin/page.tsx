import Link from "next/link";
import { PageShell } from "@/components/common/PageShell";
import { EventList } from "@/components/events/EventList";
import { EventTypeFilter } from "@/components/admin/EventTypeFilter";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePageSession } from "@/server/auth/sessions";
import { authEventTypes } from "@/server/db/schema";
import { listUsers, revokedCredentials } from "@/server/admin/queries";
import { listEvents } from "@/server/devices/events";
import { parseEventType } from "@/server/devices/event-view";
import { REVOKE_REASON_TEXT } from "@/server/devices/devices";

const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  await requirePageSession({ admin: true, next: "/admin" });
  const type = parseEventType((await searchParams).type, authEventTypes);
  const users = listUsers();
  const events = listEvents({ type });
  const revoked = revokedCredentials();

  return (
    <PageShell eyebrow="Admin console" title="Admin" voiceText="Users, devices, sign-in history and removed devices." wide>
      <section>
        <h2 className="mb-2 text-lg font-semibold">Users</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Devices</TableHead>
              <TableHead>Face</TableHead>
              <TableHead>Last sign-in</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <Link href={`/admin/users/${u.id}`} className="font-medium underline">
                    @{u.handle}
                  </Link>
                </TableCell>
                <TableCell>{u.activeDevices}</TableCell>
                <TableCell>{u.faceEnrolled ? "yes" : "no"}</TableCell>
                <TableCell>{u.lastLogin ? fmt.format(u.lastLogin) : "never"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Event feed</h2>
        <EventTypeFilter current={type} />
        <EventList events={events} admin />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Revoked credentials</h2>
        {revoked.length === 0 ? (
          <p className="text-muted-foreground">None.</p>
        ) : (
          <ul className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card text-sm">
            {revoked.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span>
                  <Link href={`/admin/users/${c.userId}`} className="underline">
                    @{c.handle}
                  </Link>{" "}
                  · {c.label}
                </span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  {c.revokedReason && (
                    <Badge variant={c.revokedReason === "clone_detected" ? "destructive" : "outline"}>
                      {REVOKE_REASON_TEXT[c.revokedReason]}
                    </Badge>
                  )}
                  {c.revokedAt && fmt.format(c.revokedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
