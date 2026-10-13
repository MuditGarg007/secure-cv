import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "@/server/db/client";
import type { Challenge, ChallengePurpose } from "@/server/db/schema";
import { ApiError } from "@/server/http";
import { FLOW_COOKIE, WEBAUTHN_CHALLENGE_TTL_MS } from "@/server/config";
import { isHttps } from "@/server/env";
import { randomToken, sha256 } from "@/server/crypto";

export type NewChallenge = {
  purpose: ChallengePurpose;
  challenge: string;
  userId?: string | null;
  targetId?: string | null;
  data?: Record<string, unknown> | null;
  attemptsLeft?: number | null;
  ttlMs: number;
};

export function createChallenge(c: NewChallenge): Challenge {
  return db
    .insert(schema.challenges)
    .values({
      purpose: c.purpose,
      challenge: c.challenge,
      userId: c.userId ?? null,
      targetId: c.targetId ?? null,
      data: c.data ?? null,
      attemptsLeft: c.attemptsLeft ?? null,
      expiresAt: Date.now() + c.ttlMs,
    })
    .returning()
    .get();
}

/** Read a live challenge without consuming it (liveness attempts). Throws CHALLENGE_EXPIRED. */
export function peekChallenge(id: string, purpose: ChallengePurpose, targetId?: string): Challenge {
  const row = db
    .select()
    .from(schema.challenges)
    .where(
      and(
        eq(schema.challenges.id, id),
        eq(schema.challenges.purpose, purpose),
        gt(schema.challenges.expiresAt, Date.now()),
      ),
    )
    .get();
  if (!row || (targetId !== undefined && row.targetId !== targetId)) {
    throw new ApiError("CHALLENGE_EXPIRED");
  }
  return row;
}

/** Single-use: load, check purpose/expiry/target, delete. Throws CHALLENGE_EXPIRED. */
export function consumeChallenge(id: string, purpose: ChallengePurpose, targetId?: string): Challenge {
  const row = db.delete(schema.challenges).where(eq(schema.challenges.id, id)).returning().get();
  if (
    !row ||
    row.purpose !== purpose ||
    row.expiresAt <= Date.now() ||
    (targetId !== undefined && row.targetId !== targetId)
  ) {
    throw new ApiError("CHALLENGE_EXPIRED");
  }
  return row;
}

export function deleteChallenge(id: string): void {
  db.delete(schema.challenges).where(eq(schema.challenges.id, id)).run();
}

const cookieBase = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: isHttps };

// ---- flow cookie: which WebAuthn ceremony this browser is in the middle of ----
export async function setFlowCookie(challengeId: string): Promise<void> {
  (await cookies()).set(FLOW_COOKIE, challengeId, {
    ...cookieBase,
    maxAge: Math.ceil(WEBAUTHN_CHALLENGE_TTL_MS / 1000),
  });
}

export async function takeFlowCookie(): Promise<string> {
  const jar = await cookies();
  const id = jar.get(FLOW_COOKIE)?.value;
  jar.delete(FLOW_COOKIE);
  if (!id) throw new ApiError("CHALLENGE_EXPIRED");
  return id;
}

// ---- binding cookies: tie a link / recovery to the browser that started it ----
/** Sets an httpOnly random-token cookie and returns sha256(token) to store in the DB. */
export async function setBindingCookie(name: string, ttlMs: number): Promise<string> {
  const token = randomToken();
  (await cookies()).set(name, token, { ...cookieBase, maxAge: Math.ceil(ttlMs / 1000) });
  return sha256(token);
}

/** sha256 of the binding cookie, or null if absent. Compare with the stored hash. */
export async function readBindingHash(name: string): Promise<string | null> {
  const token = (await cookies()).get(name)?.value;
  return token ? sha256(token) : null;
}

export async function clearCookie(name: string): Promise<void> {
  (await cookies()).delete(name);
}
