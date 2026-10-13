// Browser-side fetch helper for our /api routes. Throws ApiClientError with the server's code.
export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T = Record<string, unknown>>(
  path: string,
  opts: { method?: string; json?: unknown; form?: FormData; headers?: Record<string, string> } = {},
): Promise<T> {
  const headers: Record<string, string> = { ...opts.headers };
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.json);
  }
  const res = await fetch(path, {
    method: opts.method ?? (body ? "POST" : "GET"),
    headers,
    body,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error ?? {};
    throw new ApiClientError(err.code ?? "INTERNAL", err.message ?? "Something went wrong.", res.status);
  }
  return data as T;
}
