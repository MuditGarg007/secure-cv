import { authEventTypes, type AuthEventType } from "@/server/db/schema";
import { Button } from "@/components/ui/button";

/** Plain GET form so the filter works without client JS. */
export function EventTypeFilter({ current }: { current: AuthEventType | null }) {
  return (
    <form method="get" className="flex flex-wrap items-center gap-2">
      <label htmlFor="type" className="text-sm">
        Type
      </label>
      <select
        id="type"
        name="type"
        defaultValue={current ?? ""}
        className="h-8 rounded-md border bg-background px-2 text-sm"
      >
        <option value="">All events</option>
        {authEventTypes.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="outline">
        Filter
      </Button>
    </form>
  );
}
