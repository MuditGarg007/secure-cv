import "server-only";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

type DB = BetterSQLite3Database<typeof schema>;

// Opens web/data/app.db and applies migrations from web/drizzle on FIRST USE (lazy, so
// `next build` workers don't race on it). Reset local data with `pnpm db:reset`.
function open(): DB {
  const dir = path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  const sqlite = new Database(path.join(dir, "app.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

const g = globalThis as unknown as { __db?: DB };
const get = (): DB => (g.__db ??= open());

export const db: DB = new Proxy({} as DB, {
  get(_t, prop) {
    const real = get();
    const v = Reflect.get(real, prop, real);
    return typeof v === "function" ? v.bind(real) : v;
  },
});
export { schema };
