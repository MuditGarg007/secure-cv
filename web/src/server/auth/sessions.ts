import "server-only";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, schema } from "@/server/db/client";
import type { Session, User } from "@/server/db/schema";
import { ApiError } from "@/server/http";
import { REAUTH_WINDOW_MS, SESSION_COOKIE, SESSION_TTL_MS } from "@/server/config";
import { isHttps } from "@/server/env";
import { randomToken, sha256 } from "@/server/crypto";
import { isAdmin } from "@/server/users";

export type SessionContext = { session: Session; user: User };

async function setSessionCookie(token: string, expiresAt: number) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isHttps,
    expires: new Date(expiresAt),
  });
}

/**
 * Issue a session after a successful passkey assertion/registration and set the `sid` cookie.
 * reauth_at starts at now because the session was born from a fresh assertion.
 */
export async function createSession(opts: {
  userId: string;
  credentialId: string | null; // credentials.id (row id)
  stepUpPending?: boolean;
}): Promise<Session> {
  const token = randomToken();
  const now = Date.now();
  const session = db
    .insert(schema.sessions)
    .values({
      tokenHash: sha256(token),
      userId: opts.userId,
      credentialId: opts.credentialId,
      stepUpPending: opts.stepUpPending ?? false,
      reauthAt: now,
      expiresAt: now + SESSION_TTL_MS,
    })
    .returning()
    .get();
  await setSessionCookie(token, session.expiresAt);
  return session;
}

/** Current valid session + user, or null. Does not check step-up / reauth. */
export async function getCurrentSession(): Promise<SessionContext | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = db
    .select()
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(
      and(
        eq(schema.sessions.tokenHash, sha256(token)),
        isNull(schema.sessions.revokedAt),
        gt(schema.sessions.expiresAt, Date.now()),
      ),
    )
    .get();
  return row ? { session: row.sessions, user: row.users } : null;
}

export type RequireOpts = {
  /** Require a fresh passkey assertion within REAUTH_WINDOW_MS (sensitive actions). */
  reauth?: boolean;
  /** Allow sessions with step_up_pending (only /api/stepup/* and logout). */
  allowPending?: boolean;
  /** Require ADMIN_HANDLES membership. */
  admin?: boolean;
};

/** The one guard every protected route handler calls. Throws ApiError. */
export async function requireSession(opts: RequireOpts = {}): Promise<SessionContext> {
  const ctx = await getCurrentSession();
  if (!ctx) throw new ApiError("UNAUTHENTICATED");
  if (ctx.session.stepUpPending && !opts.allowPending) throw new ApiError("STEP_UP_REQUIRED");
  if (opts.admin && !isAdmin(ctx.user)) throw new ApiError("FORBIDDEN");
  if (opts.reauth && !isReauthFresh(ctx.session)) throw new ApiError("REAUTH_REQUIRED");
  return ctx;
}

export function isReauthFresh(session: Session): boolean {
  return session.reauthAt !== null && Date.now() - session.reauthAt <= REAUTH_WINDOW_MS;
}

/**
 * Page guard for server components: redirects instead of throwing.
 * `next` (a relative path) is passed to /signin so the user comes back after signing in.
 */
export async function requirePageSession(
  opts: { admin?: boolean; next?: string } = {},
): Promise<SessionContext> {
  const ctx = await getCurrentSession();
  if (!ctx) redirect(opts.next ? `/signin?next=${encodeURIComponent(opts.next)}` : "/signin");
  if (ctx.session.stepUpPending) redirect("/signin/step-up");
  if (opts.admin && !isAdmin(ctx.user)) redirect("/home");
  return ctx;
}

export function markReauth(sessionId: string): void {
  db.update(schema.sessions).set({ reauthAt: Date.now() }).where(eq(schema.sessions.id, sessionId)).run();
}

/** Step-up passed: clear pending, rotate the token, count as fresh reauth. */
export async function completeStepUp(sessionId: string): Promise<void> {
  const token = randomToken();
  const s = db
    .update(schema.sessions)
    .set({ stepUpPending: false, tokenHash: sha256(token), reauthAt: Date.now() })
    .where(eq(schema.sessions.id, sessionId))
    .returning()
    .get();
  if (s) await setSessionCookie(token, s.expiresAt);
}

export function revokeSession(sessionId: string): void {
  db.update(schema.sessions)
    .set({ revokedAt: Date.now() })
    .where(and(eq(schema.sessions.id, sessionId), isNull(schema.sessions.revokedAt)))
    .run();
}

/** Revoke the current session and clear the cookie (logout, failed step-up). */
export async function endCurrentSession(sessionId: string): Promise<void> {
  revokeSession(sessionId);
  (await cookies()).delete(SESSION_COOKIE);
}

export function revokeSessionsForCredential(credentialRowId: string): void {
  db.update(schema.sessions)
    .set({ revokedAt: Date.now() })
    .where(and(eq(schema.sessions.credentialId, credentialRowId), isNull(schema.sessions.revokedAt)))
    .run();
}

export function revokeAllSessionsForUser(userId: string, exceptSessionId?: string): void {
  db.update(schema.sessions)
    .set({ revokedAt: Date.now() })
    .where(
      and(
        eq(schema.sessions.userId, userId),
        isNull(schema.sessions.revokedAt),
        exceptSessionId ? ne(schema.sessions.id, exceptSessionId) : undefined,
      ),
    )
    .run();
}
