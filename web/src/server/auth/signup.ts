import "server-only";
import { z } from "zod";
import { db, schema } from "@/server/db/client";
import type { Challenge, Credential, User } from "@/server/db/schema";
import { ApiError } from "@/server/http";
import type { NewCredential } from "@/server/auth/webauthn";

// Sign-up: the user row is created only after the passkey verifies (docs/data-model.md
// challenges.data). Both rows go in one synchronous SQLite transaction.

/** Shape stored on the register challenge by /api/auth/register/options. */
export const pendingSignupSchema = z.object({
  handle: z.string(),
  displayName: z.string(),
  webauthnUserId: z.string(),
});
export type PendingSignup = z.infer<typeof pendingSignupSchema>;

export function pendingSignup(challenge: Challenge): PendingSignup {
  const parsed = pendingSignupSchema.safeParse(challenge.data);
  if (!parsed.success) throw new ApiError("CHALLENGE_EXPIRED");
  return parsed.data;
}

function isHandleConflict(e: unknown): boolean {
  // drizzle wraps the better-sqlite3 error in `cause`; check both.
  for (let err: unknown = e; err; err = (err as { cause?: unknown }).cause) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("UNIQUE constraint failed: users.handle")) return true;
  }
  return false;
}

export function createUserWithCredential(opts: {
  pending: PendingSignup;
  credential: NewCredential;
  label: string;
  ua: string | null;
}): { user: User; credential: Credential } {
  try {
    return db.transaction((tx) => {
      const user = tx
        .insert(schema.users)
        .values({
          handle: opts.pending.handle,
          displayName: opts.pending.displayName,
          webauthnUserId: opts.pending.webauthnUserId,
        })
        .returning()
        .get();
      // Same values as saveCredential(), inside the transaction.
      const credential = tx
        .insert(schema.credentials)
        .values({
          userId: user.id,
          credentialId: opts.credential.credentialId,
          publicKey: opts.credential.publicKey,
          signCount: opts.credential.signCount,
          transports: opts.credential.transports,
          label: opts.label,
          lastUsedAt: Date.now(),
          lastUsedUa: opts.ua,
        })
        .returning()
        .get();
      return { user, credential };
    });
  } catch (e) {
    if (isHandleConflict(e)) throw new ApiError("HANDLE_TAKEN", "That username is taken.");
    throw e;
  }
}
