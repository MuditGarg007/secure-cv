import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { randomInt } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/server/db/client";

// Recovery code: 100 random bits as 20 Crockford base32 chars, shown as
// XXXX-XXXX-XXXX-XXXX-XXXX. Stored only as argon2id. One active code per user.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateRecoveryCode(): string {
  let s = "";
  for (let i = 0; i < 20; i++) s += ALPHABET[randomInt(32)];
  return s.match(/.{4}/g)!.join("-");
}

/** Uppercase, strip separators, map Crockford look-alikes (I/L→1, O→0). */
export function normalizeRecoveryCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
}

/** Create a new code for the user, superseding any active one. Returns the plaintext ONCE. */
export async function issueRecoveryCode(userId: string): Promise<string> {
  const code = generateRecoveryCode();
  const codeHash = await hash(normalizeRecoveryCode(code));
  db.transaction((tx) => {
    tx.update(schema.recoveryCodes)
      .set({ supersededAt: Date.now() })
      .where(
        and(
          eq(schema.recoveryCodes.userId, userId),
          isNull(schema.recoveryCodes.usedAt),
          isNull(schema.recoveryCodes.supersededAt),
        ),
      )
      .run();
    tx.insert(schema.recoveryCodes).values({ userId, codeHash }).run();
  });
  return code;
}

// Fixed hash used to equalize timing when the handle doesn't exist.
let dummyHash: Promise<string> | null = null;

/**
 * Checks `code` against the user's active code. Pass userId=null for an unknown handle:
 * still burns an argon2 verify so timing doesn't reveal which handles exist.
 * Returns the matching recovery_codes row id, or null.
 */
export async function checkRecoveryCode(userId: string | null, code: string): Promise<string | null> {
  const normalized = normalizeRecoveryCode(code);
  const row = userId
    ? db
        .select()
        .from(schema.recoveryCodes)
        .where(
          and(
            eq(schema.recoveryCodes.userId, userId),
            isNull(schema.recoveryCodes.usedAt),
            isNull(schema.recoveryCodes.supersededAt),
          ),
        )
        .get()
    : undefined;
  if (!row) {
    dummyHash ??= hash("0000000000000000000O");
    await verify(await dummyHash, normalized).catch(() => false);
    return null;
  }
  return (await verify(row.codeHash, normalized)) ? row.id : null;
}

export function markRecoveryCodeUsed(id: string): void {
  db.update(schema.recoveryCodes).set({ usedAt: Date.now() }).where(eq(schema.recoveryCodes.id, id)).run();
}
