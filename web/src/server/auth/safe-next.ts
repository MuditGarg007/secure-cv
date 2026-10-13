// Pure: validates a `?next=` value for post-sign-in redirects (no open redirects).

/** Returns `v` only if it is a same-site relative path like "/link/abc?n=1", else null. */
export function safeNext(v: unknown): string | null {
  if (typeof v !== "string" || v.length === 0 || v.length > 512) return null;
  if (!v.startsWith("/") || v.startsWith("//")) return null;
  // Backslashes and whitespace/control chars: browsers normalise "/\evil" and "/\t/evil" to "//evil".
  if (/[\\\s\u0000-\u001f\u007f]/.test(v)) return null;
  return v;
}
