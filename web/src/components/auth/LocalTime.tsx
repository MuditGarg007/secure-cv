"use client";

/** Formats a ms timestamp in the viewer's locale/timezone. */
export function LocalTime({ ms }: { ms: number }) {
  return (
    <time dateTime={new Date(ms).toISOString()} suppressHydrationWarning>
      {new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
    </time>
  );
}
