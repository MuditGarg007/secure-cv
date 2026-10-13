// CONTRACT, owned by agent D (recovery). Props are FROZEN.
// Server component. Agent C renders it on the admin user-detail page: this user's
// recovery requests with state and an admin Cancel button (admin+reauth).
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isOpen } from "@/server/recovery/machine";
import { recoveryRequestsForUser } from "@/server/recovery/service";
import { CancelRecoveryButton } from "./CancelRecoveryButton";
import { LocalTime } from "./LocalTime";

export type AdminRecoveryRequestsProps = { userId: string };

const METHOD_LABEL = { code_liveness: "Code + face", code_only: "Code only" } as const;

export async function AdminRecoveryRequests({ userId }: AdminRecoveryRequestsProps) {
  const requests = recoveryRequestsForUser(userId);
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Recovery requests</h2>
      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No recovery requests.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Started</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Cooldown until</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <LocalTime ms={r.createdAt} />
                </TableCell>
                <TableCell>{METHOD_LABEL[r.method]}</TableCell>
                <TableCell>
                  <Badge variant={isOpen(r.state) ? "destructive" : "secondary"}>{r.state}</Badge>
                  {r.cancelledBy && (
                    <span className="ml-1 text-xs text-muted-foreground">by {r.cancelledBy}</span>
                  )}
                </TableCell>
                <TableCell>{r.cooldownUntil ? <LocalTime ms={r.cooldownUntil} /> : "–"}</TableCell>
                <TableCell className="text-right">
                  {isOpen(r.state) && <CancelRecoveryButton recoveryId={r.id} admin />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
