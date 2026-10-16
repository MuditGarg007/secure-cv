// Pure: "Sign in with Secure" request parsing + PKCE (docs/oauth.md). No db/env/next imports.
import { createHash } from "node:crypto";
import { z } from "zod";
import { OAUTH_ACRS, OAUTH_BINDING_MESSAGE_MAX, OAUTH_CLIENTS } from "@/server/config";

export type Acr = (typeof OAUTH_ACRS)[number];

/** Query of GET /oauth/authorize, and the body of POST /api/oauth/approve (plus `decision`). */
export const AuthorizeParams = z.object({
  response_type: z.literal("code"),
  client_id: z.string().min(1).max(64),
  redirect_uri: z.string().min(1).max(256),
  state: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  code_challenge_method: z.literal("S256"),
  acr_values: z.enum(OAUTH_ACRS).default("passkey"),
  // What the app wants approved, e.g. "Transfer $2,500.00 to @bob". Shown on the consent screen.
  binding_message: z.string().trim().min(1).max(OAUTH_BINDING_MESSAGE_MAX).optional(),
});
export type AuthorizeParams = z.infer<typeof AuthorizeParams>;

export type ParsedAuthorize =
  | { ok: true; params: AuthorizeParams; clientName: string }
  | { ok: false; message: string };

/**
 * Validates an authorization request. Unknown client or redirect_uri is never redirected to
 * (open redirect), so every failure is reported on Secure's own page.
 */
export function parseAuthorize(raw: unknown): ParsedAuthorize {
  const r = AuthorizeParams.safeParse(raw);
  if (!r.success) return { ok: false, message: "This sign-in request is malformed." };
  const client = Object.hasOwn(OAUTH_CLIENTS, r.data.client_id) ? OAUTH_CLIENTS[r.data.client_id] : undefined;
  if (!client) return { ok: false, message: "Unknown app." };
  if (!client.redirectUris.includes(r.data.redirect_uri)) {
    return { ok: false, message: "This app's return address isn't registered." };
  }
  return { ok: true, params: r.data, clientName: client.name };
}

const VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function pkceMatches(verifier: string, challenge: string): boolean {
  return VERIFIER_RE.test(verifier) && pkceChallenge(verifier) === challenge;
}

/** redirect_uri with extra query params (code/state or error/state). */
export function redirectWith(uri: string, params: Record<string, string>): string {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

export function amrFor(acr: Acr): string[] {
  return acr === "liveness" ? ["passkey", "face", "gesture"] : ["passkey"];
}
