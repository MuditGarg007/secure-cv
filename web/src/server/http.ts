import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { env } from "@/server/env";

// Error codes from docs/api.md. Add new codes there AND here (master only).
export const ERROR_STATUS = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  STEP_UP_REQUIRED: 403,
  REAUTH_REQUIRED: 403,
  FORBIDDEN: 403,
  BLOCKED: 403,
  CREDENTIAL_REVOKED: 401,
  ORIGIN_MISMATCH: 400,
  CHALLENGE_EXPIRED: 400,
  WEBAUTHN_FAILED: 400,
  HANDLE_TAKEN: 409,
  BIO_NOT_ENROLLED: 409,
  LAST_CREDENTIAL: 409,
  RECOVERY_INVALID: 400,
  RECOVERY_STATE: 409,
  NOT_FOUND: 404,
  LINK_EXPIRED: 410,
  BIO_UNAVAILABLE: 503,
  INTERNAL: 500,
} as const;
export type ErrorCode = keyof typeof ERROR_STATUS;

const DEFAULT_MESSAGE: Partial<Record<ErrorCode, string>> = {
  UNAUTHENTICATED: "Please sign in.",
  STEP_UP_REQUIRED: "Extra verification needed.",
  REAUTH_REQUIRED: "Confirm it's you with your passkey.",
  FORBIDDEN: "Not allowed.",
  CHALLENGE_EXPIRED: "This took too long. Please try again.",
  WEBAUTHN_FAILED: "Passkey check failed. Please try again.",
  BIO_UNAVAILABLE: "Face check is unavailable right now.",
  BIO_NOT_ENROLLED: "Face check isn't set up for this account.",
  INTERNAL: "Something went wrong.",
};

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message?: string,
  ) {
    super(message ?? DEFAULT_MESSAGE[code] ?? code);
  }
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof ApiError) {
    return NextResponse.json(
      { error: { code: e.code, message: e.message } },
      { status: ERROR_STATUS[e.code] },
    );
  }
  if (e instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Invalid input." } },
      { status: 400 },
    );
  }
  console.error("[api] unhandled error:", e instanceof Error ? e.message : "unknown");
  return NextResponse.json(
    { error: { code: "INTERNAL", message: DEFAULT_MESSAGE.INTERNAL } },
    { status: 500 },
  );
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Wrap every route handler:
 *   export const POST = route(async (req, ctx: RouteContext<"/api/x/[id]">) => { ... });
 * - Mutating methods require `Origin` header === ORIGIN (CSRF, docs/auth.md#sessions).
 * - ApiError / ZodError become the standard error JSON.
 */
export function route<C>(handler: (req: NextRequest, ctx: C) => Promise<Response>) {
  return async (req: NextRequest, ctx: C): Promise<Response> => {
    try {
      if (MUTATING.has(req.method) && req.headers.get("origin") !== env.ORIGIN) {
        throw new ApiError("FORBIDDEN", "Bad origin.");
      }
      return await handler(req, ctx);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Parse a JSON body with zod. Empty body parses as {}. */
export async function parseJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  const text = await req.text();
  let raw: unknown = {};
  if (text) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw new ApiError("VALIDATION", "Body must be JSON.");
    }
  }
  return schema.parse(raw);
}

export function ok<T extends object>(data: T = {} as T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}
