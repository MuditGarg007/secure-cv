"use client";

/** Only rendered while bio reports BIO_FAKE=1. Picks the fake decision; real mode ignores it. */
export function DevFakePicker({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-dashed border-amber-500 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
      <span className="font-medium">Dev · bio fake mode result:</span>
      <select className="rounded border bg-background px-1 py-0.5" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
