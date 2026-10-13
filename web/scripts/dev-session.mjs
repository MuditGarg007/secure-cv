#!/usr/bin/env node
// DEV ONLY. Creates (or reuses) a user in this worktree's web/data/app.db and prints a
// session cookie, so agents can test signed-in flows before the auth branch is merged.
// This is a CLI tool with direct DB access, not an HTTP route: it adds no login path to
// the app. Never use it in the demo.
//
//   pnpm dev:session <handle> [--pending] [--stale] [--face] [--cred] [--code]
//     --pending  session has step_up_pending = 1 (to test /signin/step-up)
//     --stale    reauth_at 10 min ago (to test REAUTH_REQUIRED)
//     --face     give the user a fake face_template_enc (BIO_FAKE only)
//     --cred     add a dummy credential row (its passkey can't actually sign)
//     --code     issue a new recovery code (supersedes the old one) and print it
// Then in the browser console on your port:  document.cookie = "<printed value>"
import Database from "better-sqlite3";
import { hash } from "@node-rs/argon2";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

if (process.env.NODE_ENV === "production") throw new Error("dev only");
const args = process.argv.slice(2);
const handle = args.find((a) => !a.startsWith("--"))?.toLowerCase();
if (!handle || !/^[a-z0-9_]{3,32}$/.test(handle)) {
  console.error("usage: pnpm dev:session <handle> [--pending] [--stale] [--face] [--cred] [--code]");
  process.exit(1);
}
// Same file + migrations as web/src/server/db/client.ts (idempotent).
fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
const db = new Database(path.join(process.cwd(), "data", "app.db"));
db.pragma("journal_mode = WAL");
migrate(drizzle(db), { migrationsFolder: path.join(process.cwd(), "drizzle") });
const now = Date.now();
let user = db.prepare("select * from users where handle = ?").get(handle);
if (!user) {
  const id = randomUUID();
  db.prepare(
    "insert into users (id, handle, display_name, webauthn_user_id, created_at) values (?, ?, ?, ?, ?)",
  ).run(id, handle, handle, randomBytes(32).toString("base64url"), now);
  user = db.prepare("select * from users where id = ?").get(id);
}
if (args.includes("--face")) {
  db.prepare("update users set face_template_enc = ? where id = ?").run("DEV-FAKE-TEMPLATE", user.id);
}
let credId = null;
if (args.includes("--cred")) {
  credId = randomUUID();
  db.prepare(
    "insert into credentials (id, user_id, credential_id, public_key, sign_count, transports, label, created_at) values (?, ?, ?, ?, 0, '[]', ?, ?)",
  ).run(credId, user.id, randomBytes(16).toString("base64url"), randomBytes(77), "Dev dummy device", now);
}
let code = null;
if (args.includes("--code")) {
  // Same format/normalisation as web/src/server/recovery-code.ts.
  const A = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const raw = Array.from(randomBytes(20), (b) => A[b % 32]).join("");
  code = raw.match(/.{4}/g).join("-");
  db.prepare(
    "update recovery_codes set superseded_at = ? where user_id = ? and used_at is null and superseded_at is null",
  ).run(now, user.id);
  db.prepare("insert into recovery_codes (id, user_id, code_hash, created_at) values (?, ?, ?, ?)").run(
    randomUUID(),
    user.id,
    await hash(raw),
    now,
  );
}
const token = randomBytes(32).toString("base64url");
db.prepare(
  "insert into sessions (id, token_hash, user_id, credential_id, step_up_pending, reauth_at, expires_at, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
).run(
  randomUUID(),
  createHash("sha256").update(token).digest("hex"),
  user.id,
  credId,
  args.includes("--pending") ? 1 : 0,
  args.includes("--stale") ? now - 10 * 60 * 1000 : now,
  now + 12 * 60 * 60 * 1000,
  now,
);
console.log(`user ${handle} (${user.id})`);
if (code) console.log(`recovery code: ${code}`);
console.log(`document.cookie = "sid=${token}; path=/"`);
