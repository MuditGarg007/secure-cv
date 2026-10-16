// Tiny JSON-file store for the mock bank. Money is integer cents. Not a real ledger.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomInt, randomUUID } from "node:crypto";
import { dirname } from "node:path";

const FILE = new URL("./data/bank.json", import.meta.url).pathname;

let db = { customers: {}, accounts: {}, transactions: [] };
try {
  db = JSON.parse(readFileSync(FILE, "utf8"));
} catch {
  // first run
}

function save() {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(`${FILE}.tmp`, JSON.stringify(db, null, 2));
  renameSync(`${FILE}.tmp`, FILE);
}

const DAY = 24 * 60 * 60 * 1000;

function addTx(accountId, amount, description, at = Date.now(), ref = null) {
  const acct = db.accounts[accountId];
  acct.balance += amount;
  const tx = { id: randomUUID(), accountId, amount, description, balance: acct.balance, at, ref };
  db.transactions.push(tx);
  return tx;
}

function openAccount(customerId, type, name, opening, history) {
  const id = randomUUID();
  const number = String(randomInt(10_000_000, 99_999_999));
  db.accounts[id] = { id, customerId, type, name, number, balance: 0 };
  const start = Date.now() - 30 * DAY;
  addTx(id, opening, "Opening balance", start);
  for (const [daysAgo, amount, description] of history) addTx(id, amount, description, Date.now() - daysAgo * DAY);
  return id;
}

/** Find the customer for a Secure user id (`sub`), creating demo accounts on first sign-in. */
export function upsertCustomer({ sub, handle, name }) {
  let c = db.customers[sub];
  if (!c) {
    c = { id: sub, handle, name, createdAt: Date.now(), lastLogin: null };
    db.customers[sub] = c;
    openAccount(sub, "checking", "Everyday Checking", 320_000, [
      [21, 245_000, "PAYROLL DEPOSIT - ACME CORP"],
      [18, -8_423, "GROCERY MART #0442"],
      [14, -12_950, "CITY POWER & LIGHT"],
      [9, -450, "CORNER COFFEE CO"],
      [6, -6_000, "ATM WITHDRAWAL - MAIN ST"],
      [2, -3_899, "STREAMFLIX SUBSCRIPTION"],
    ]);
    openAccount(sub, "savings", "High Yield Savings", 1_280_000, [[30, 1_067, "INTEREST PAYMENT"]]);
  }
  c.handle = handle;
  c.name = name;
  save();
  return c;
}

export function recordLogin(customerId, info) {
  const c = db.customers[customerId];
  c.previousLogin = c.lastLogin;
  c.lastLogin = info;
  save();
}

export const getCustomer = (id) => db.customers[id] ?? null;
export const customerByHandle = (handle) =>
  Object.values(db.customers).find((c) => c.handle === handle.toLowerCase()) ?? null;
export const accountsOf = (customerId) =>
  Object.values(db.accounts).filter((a) => a.customerId === customerId);
export const getAccount = (id) => db.accounts[id] ?? null;
export const transactionsOf = (accountId, limit = 50) =>
  db.transactions
    .filter((t) => t.accountId === accountId)
    .sort((a, b) => b.at - a.at)
    .slice(0, limit);

/**
 * Move money. `to` is an account id. Returns {ok, ref} or {ok:false, error}.
 * Checks again here so a stale pending transfer can't overdraw.
 */
export function transfer({ fromId, toId, amount, memo, verifiedWith }) {
  const from = db.accounts[fromId];
  const to = db.accounts[toId];
  if (!from || !to || fromId === toId) return { ok: false, error: "Invalid accounts." };
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, error: "Invalid amount." };
  if (from.balance < amount) return { ok: false, error: "Insufficient funds." };
  const ref = `TRF${randomInt(100_000, 999_999)}`;
  const fromCust = db.customers[from.customerId];
  const toCust = db.customers[to.customerId];
  const note = memo ? ` - ${memo}` : "";
  const now = Date.now();
  addTx(fromId, -amount, `TRANSFER TO ${toCust.name.toUpperCase()} ••${to.number.slice(-4)}${note}`, now, ref);
  addTx(toId, amount, `TRANSFER FROM ${fromCust.name.toUpperCase()} ••${from.number.slice(-4)}${note}`, now, ref);
  db.transfers ??= {};
  db.transfers[ref] = { ref, fromId, toId, amount, memo, at: now, verifiedWith };
  save();
  return { ok: true, ref };
}

export const getTransfer = (ref) => db.transfers?.[ref] ?? null;
