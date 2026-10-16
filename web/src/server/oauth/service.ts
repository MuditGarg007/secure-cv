import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import type { Session, User } from "@/server/db/schema";
import { createChallenge, consumeChallenge } from "@/server/auth/challenges";
import { OAUTH_CODE_TTL_MS, OAUTH_LIVENESS_PASS_TTL_MS } from "@/server/config";
import { getUserById } from "@/server/users";
import { amrFor, pkceMatches, type Acr, type AuthorizeParams } from "@/server/oauth/params";

// "Sign in with Secure" (docs/oauth.md). Codes and liveness passes live in `challenges`.

/** What the token endpoint returns to the app. Never includes biometric scores. */
export type IdentityClaims = {
  sub: string;
  handle: string;
  name: string;
  acr: Acr;
  amr: string[];
  auth_time: number; // unix seconds of the passkey assertion this rests on
};

/** One-time code (challenge row id), bound to client, redirect_uri, PKCE and the user. */
export function issueCode(opts: { user: User; session: Session; params: AuthorizeParams }): string {
  const { params } = opts;
  const row = createChallenge({
    purpose: "oauth_code",
    challenge: params.code_challenge,
    userId: opts.user.id,
    targetId: params.client_id,
    data: {
      redirectUri: params.redirect_uri,
      acr: params.acr_values,
      authTime: opts.session.reauthAt ?? Date.now(),
    },
    ttlMs: OAUTH_CODE_TTL_MS,
  });
  return row.id;
}

/** Single-use. Returns null on any mismatch (the code is burned either way). */
export function redeemCode(opts: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): IdentityClaims | null {
  let row;
  try {
    row = consumeChallenge(opts.code, "oauth_code", opts.clientId);
  } catch {
    return null;
  }
  const data = row.data as { redirectUri?: string; acr?: Acr; authTime?: number } | null;
  if (!data || data.redirectUri !== opts.redirectUri || !data.acr) return null;
  if (!pkceMatches(opts.codeVerifier, row.challenge)) return null;
  const user = row.userId ? getUserById(row.userId) : undefined;
  if (!user) return null;
  return {
    sub: user.id,
    handle: user.handle,
    name: user.displayName,
    acr: data.acr,
    amr: amrFor(data.acr),
    auth_time: Math.floor((data.authTime ?? Date.now()) / 1000),
  };
}

/** The app liveness check passed on this session; spendable once, briefly. */
export function recordLivenessPass(sessionId: string): void {
  db.delete(schema.challenges)
    .where(and(eq(schema.challenges.purpose, "oauth_liveness_pass"), eq(schema.challenges.targetId, sessionId)))
    .run();
  createChallenge({
    purpose: "oauth_liveness_pass",
    challenge: "-",
    targetId: sessionId,
    ttlMs: OAUTH_LIVENESS_PASS_TTL_MS,
  });
}

export function takeLivenessPass(sessionId: string): boolean {
  const c = schema.challenges;
  const row = db
    .delete(c)
    .where(and(eq(c.purpose, "oauth_liveness_pass"), eq(c.targetId, sessionId), gt(c.expiresAt, Date.now())))
    .returning({ id: c.id })
    .get();
  return !!row;
}
