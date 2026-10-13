"use client";

/** A timestamp in the viewer's own locale and timezone (server components can't know it). */
export function LocalTime({ ms }: { ms: number }) {
  return (
    <time dateTime={new Date(ms).toISOString()} suppressHydrationWarning>
      {new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
    </time>
  );
}
