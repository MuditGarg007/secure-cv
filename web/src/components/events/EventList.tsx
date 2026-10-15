import type { EventRow } from "@/server/devices/events";
import { viewEvent, type EventTone } from "@/server/devices/event-view";
import { labelFromUA } from "@/lib/ua";
import { Badge } from "@/components/ui/badge";

const TONE_CLASS: Record<EventTone, string> = {
  allowed: "text-primary",
  step_up: "text-amber-600 dark:text-amber-400",
  blocked: "text-red-600 dark:text-red-400",
  device: "text-blue-700 dark:text-blue-400",
  info: "text-muted-foreground",
};

const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

/**
 * Server component. `admin` adds user handle, risk score + signals and the failure reason.
 * Users never see metadata blobs.
 */
export function EventList({ events, admin = false }: { events: EventRow[]; admin?: boolean }) {
  if (events.length === 0) return <p className="text-muted-foreground">No activity yet.</p>;
  return (
    <ul className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
      {events.map((e) => {
        const v = viewEvent(e);
        const device = e.deviceLabel ?? (e.ua ? labelFromUA(e.ua) : null);
        const reason = admin && typeof e.metadata?.reason === "string" ? e.metadata.reason : null;
        const action = admin && typeof e.metadata?.action === "string" ? e.metadata.action : null;
        return (
          <li
            key={e.id}
            className={`flex gap-3 p-3 ${v.phishing ? "border-l-4 border-l-red-600 bg-red-50 dark:bg-red-950/40" : ""}`}
          >
            <span className={`w-6 shrink-0 text-center text-lg ${TONE_CLASS[v.tone]}`} aria-hidden>
              {v.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`font-medium ${v.phishing ? "text-red-700 dark:text-red-400" : ""}`}>{v.label}</span>
                {v.phishing && <Badge variant="destructive">Phishing</Badge>}
                {admin && e.handle && <Badge variant="outline">@{e.handle}</Badge>}
              </div>
              <div className="text-sm text-muted-foreground">
                {fmt.format(e.createdAt)}
                {e.country && ` · ${e.country}`}
                {device && ` · ${device}`}
              </div>
              {admin && (e.riskScore !== null || reason || action || e.riskSignals?.length) && (
                <div className="mt-1 flex flex-wrap gap-1 text-xs">
                  {e.riskScore !== null && <Badge variant="secondary">risk {e.riskScore}</Badge>}
                  {e.riskSignals?.map((s) => (
                    <Badge key={s} variant="outline">
                      {s}
                    </Badge>
                  ))}
                  {reason && <Badge variant={v.phishing ? "destructive" : "outline"}>reason: {reason}</Badge>}
                  {action && <Badge variant="outline">{action}</Badge>}
                  <span className="text-muted-foreground">{e.type}</span>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
