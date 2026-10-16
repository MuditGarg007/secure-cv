// Mock Bank of Localhost: a sample app that uses Secure for sign-in ("Sign in with Secure",
// OAuth 2 authorization code + PKCE, docs/oauth.md). No dependencies, Node >= 22.
//
// - Sign on: redirect to Secure (acr "passkey") → /callback → swap the code for the user's identity.
// - Transfers over STEP_UP_OVER: redirect to Secure again with acr "liveness" and a binding message;
//   the transfer runs only when Secure returns the same user verified with passkey + face + gesture.
import http from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import * as store from "./store.mjs";
import * as v from "./views.mjs";

const PORT = Number(process.env.PORT ?? 4000);
const BANK_URL = process.env.BANK_URL ?? `http://localhost:${PORT}`;
const SECURE_URL = process.env.SECURE_URL ?? "http://localhost:3000";
const CLIENT_ID = "mockbank";
const REDIRECT_URI = `${BANK_URL}/callback`;

const STEP_UP_OVER = 100_000; // cents: transfers above $1,000.00 need passkey + face + gesture
const MAX_TRANSFER = 5_000_000; // cents
const SESSION_IDLE_MS = 15 * 60 * 1000;
const PENDING_TTL_MS = 5 * 60 * 1000; // a trip to Secure and back
const MAX_AUTH_AGE_S = 5 * 60; // Secure's passkey assertion must be this fresh

const CSS = readFileSync(new URL("./public/style.css", import.meta.url));

// ---- in-memory state (a restart signs everyone out) ----
const sessions = new Map(); // sid → {customerId, csrf, authTime, amr, expiresAt}
const pending = new Map(); // state → {verifier, browser, kind, transfer?, customerId?, expiresAt}

const token = (n = 32) => randomBytes(n).toString("base64url");
const b64sha256 = (s) => createHash("sha256").update(s).digest("base64url");

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const cookie = (name, value, maxAgeS) =>
  `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeS}`;

function send(res, status, html, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'; form-action 'self' " + SECURE_URL,
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    ...headers,
  });
  res.end(html);
}

function redirect(res, location, headers = {}) {
  res.writeHead(303, { Location: location, "Cache-Control": "no-store", ...headers });
  res.end();
}

async function readForm(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10_000) throw new Error("body too large");
  }
  return Object.fromEntries(new URLSearchParams(body));
}

function currentSession(req) {
  const sid = cookies(req).mb_sid;
  const s = sid && sessions.get(sid);
  if (!s || s.expiresAt < Date.now()) {
    if (sid) sessions.delete(sid);
    return null;
  }
  s.expiresAt = Date.now() + SESSION_IDLE_MS;
  const customer = store.getCustomer(s.customerId);
  return customer ? { sid, s, customer } : null;
}

// ---- Sign in with Secure ----

/** Start a round trip to Secure. `extra` = what to do when it comes back. */
function startAuth(req, res, { acr, bindingMessage, ...extra }) {
  const browser = cookies(req).mb_pre || token(16);
  const state = token(16);
  const verifier = token(48);
  pending.set(state, { verifier, browser, expiresAt: Date.now() + PENDING_TTL_MS, ...extra });
  const q = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    state,
    code_challenge: b64sha256(verifier),
    code_challenge_method: "S256",
    acr_values: acr,
  });
  if (bindingMessage) q.set("binding_message", bindingMessage);
  redirect(res, `${SECURE_URL}/oauth/authorize?${q}`, {
    "Set-Cookie": cookie("mb_pre", browser, PENDING_TTL_MS / 1000),
  });
}

async function exchangeCode(code, verifier) {
  const r = await fetch(`${SECURE_URL}/api/oauth/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    }),
  });
  if (!r.ok) return null;
  const claims = await r.json();
  const fresh = Math.abs(Date.now() / 1000 - claims.auth_time) <= MAX_AUTH_AGE_S;
  return fresh && claims.sub && claims.handle ? claims : null;
}

async function callback(req, res, url) {
  const state = url.searchParams.get("state") ?? "";
  const p = pending.get(state);
  pending.delete(state);
  if (!p || p.expiresAt < Date.now() || p.browser !== cookies(req).mb_pre) {
    return redirect(res, "/?msg=expired");
  }
  const session = currentSession(req);
  const code = url.searchParams.get("code");

  if (p.kind === "login") {
    if (!code) return redirect(res, "/?msg=cancelled");
    const claims = await exchangeCode(code, p.verifier);
    if (!claims) return redirect(res, "/?msg=failed");
    const customer = store.upsertCustomer({ sub: claims.sub, handle: claims.handle, name: claims.name });
    store.recordLogin(customer.id, { at: claims.auth_time * 1000, amr: claims.amr });
    if (session) sessions.delete(session.sid);
    const sid = token();
    sessions.set(sid, {
      customerId: customer.id,
      csrf: token(16),
      authTime: claims.auth_time * 1000,
      amr: claims.amr,
      expiresAt: Date.now() + SESSION_IDLE_MS,
    });
    return redirect(res, "/accounts", { "Set-Cookie": cookie("mb_sid", sid, 12 * 60 * 60) });
  }

  // kind === "transfer": same signed-in customer must approve with passkey + face + gesture.
  if (!session || session.customer.id !== p.customerId) return redirect(res, "/?msg=expired");
  if (!code) return redirect(res, "/transfer?msg=denied");
  const claims = await exchangeCode(code, p.verifier);
  if (!claims || claims.sub !== p.customerId || claims.acr !== "liveness") {
    return redirect(res, "/transfer?msg=unverified");
  }
  const r = store.transfer({ ...p.transfer, verifiedWith: v.methodLabel(claims.amr) });
  if (!r.ok) return redirect(res, "/transfer?msg=notcompleted");
  return redirect(res, `/receipt/${r.ref}`);
}

// ---- transfers ----

const MESSAGES = {
  denied: "Transfer cancelled: it was not approved in Secure.",
  unverified: "Transfer cancelled: we couldn't verify it was you.",
  expired: "Your session has expired. Please sign on again.",
  cancelled: "Sign-on cancelled.",
  failed: "We couldn't sign you on. Please try again.",
  signedoff: "You have signed off. You're still signed in to Secure on this browser.",
  notcompleted: "Transfer not completed: your balance changed. Please try again.",
};
const message = (key) => (key && Object.hasOwn(MESSAGES, key) ? MESSAGES[key] : null);

function parseAmount(s) {
  const m = /^\$?\s*(\d{1,7})(?:\.(\d{1,2}))?$/.exec(String(s ?? "").replace(/,/g, "").trim());
  return m ? Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0")) : null;
}

function postTransfer(req, res, ctx, form) {
  const accounts = store.accountsOf(ctx.customer.id);
  const again = (msg) =>
    send(res, 400, v.transferPage({ ...pageCtx(ctx), accounts, msg, form, stepUpOver: STEP_UP_OVER }));

  const from = accounts.find((a) => a.id === form.from);
  if (!from) return again("Choose an account to transfer from.");
  let to;
  let toLabel;
  if (form.to === "payee") {
    const payee = store.customerByHandle(String(form.payee ?? "").replace(/^@/, "").trim());
    if (!payee) return again("We couldn't find a Mock Bank customer with that username.");
    if (payee.id === ctx.customer.id) return again("Choose one of your own accounts instead.");
    to = store.accountsOf(payee.id).find((a) => a.type === "checking");
    toLabel = `@${payee.handle}`;
  } else {
    to = accounts.find((a) => a.id === form.to);
    toLabel = to && `${to.name.split(" ").pop()} ••${to.number.slice(-4)}`;
  }
  if (!to || to.id === from.id) return again("Choose two different accounts.");
  const amount = parseAmount(form.amount);
  if (!amount || amount <= 0) return again("Enter a valid amount, like 25.00.");
  if (amount > MAX_TRANSFER) return again(`The most you can transfer online is ${v.money(MAX_TRANSFER)}.`);
  if (amount > from.balance) return again("Insufficient funds in the selected account.");
  const memo = String(form.memo ?? "").replace(/[^\w .,'-]/g, "").slice(0, 30);
  const transfer = { fromId: from.id, toId: to.id, amount, memo };

  if (amount > STEP_UP_OVER) {
    return startAuth(req, res, {
      acr: "liveness",
      bindingMessage: `Send ${v.money(amount)} to ${toLabel}`,
      kind: "transfer",
      customerId: ctx.customer.id,
      transfer,
    });
  }
  const r = store.transfer({ ...transfer, verifiedWith: `${v.methodLabel(ctx.s.amr)} (at sign-on)` });
  if (!r.ok) return again(r.error);
  return redirect(res, `/receipt/${r.ref}`);
}

// ---- routing ----

const pageCtx = (ctx) => ({ customer: ctx.customer, csrf: ctx.s.csrf });

async function handle(req, res) {
  const url = new URL(req.url, BANK_URL);
  const path = url.pathname;
  const ctx = currentSession(req);
  const msg = message(url.searchParams.get("msg"));

  if (req.method === "GET") {
    if (path === "/style.css") {
      res.writeHead(200, { "Content-Type": "text/css", "Cache-Control": "max-age=60" });
      return res.end(CSS);
    }
    if (path === "/") return ctx ? redirect(res, "/accounts") : send(res, 200, v.homePage({ msg }));
    if (path === "/login") return startAuth(req, res, { acr: "passkey", kind: "login" });
    if (path === "/callback") return callback(req, res, url);
    if (!ctx) return redirect(res, "/?msg=expired");

    if (path === "/accounts") {
      return send(res, 200, v.accountsPage({ ...pageCtx(ctx), accounts: store.accountsOf(ctx.customer.id), msg }));
    }
    const acct = /^\/accounts\/([\w-]+)$/.exec(path);
    if (acct) {
      const account = store.getAccount(acct[1]);
      if (!account || account.customerId !== ctx.customer.id) return notFound(res, ctx);
      return send(res, 200, v.accountPage({ ...pageCtx(ctx), account, transactions: store.transactionsOf(account.id) }));
    }
    if (path === "/transfer") {
      const accounts = store.accountsOf(ctx.customer.id);
      return send(res, 200, v.transferPage({ ...pageCtx(ctx), accounts, msg, stepUpOver: STEP_UP_OVER }));
    }
    const rc = /^\/receipt\/(TRF\d+)$/.exec(path);
    if (rc) {
      const t = store.getTransfer(rc[1]);
      const from = t && store.getAccount(t.fromId);
      const to = t && store.getAccount(t.toId);
      if (!t || from.customerId !== ctx.customer.id) return notFound(res, ctx);
      const toName = to.customerId === ctx.customer.id ? to.name : store.getCustomer(to.customerId).name;
      return send(res, 200, v.receiptPage({ ...pageCtx(ctx), t, from, to, toName }));
    }
    if (path === "/security") {
      return send(res, 200, v.securityPage({ ...pageCtx(ctx), session: ctx.s, secureUrl: SECURE_URL }));
    }
    return notFound(res, ctx);
  }

  if (req.method === "POST") {
    if (!ctx) return redirect(res, "/?msg=expired");
    const form = await readForm(req);
    if (form.csrf !== ctx.s.csrf) return send(res, 403, v.errorPage({ ...pageCtx(ctx), title: "Request blocked", message: "This form expired. Please try again." }));
    if (path === "/logout") {
      sessions.delete(ctx.sid);
      return redirect(res, "/?msg=signedoff", { "Set-Cookie": cookie("mb_sid", "", 0) });
    }
    if (path === "/transfer") return postTransfer(req, res, ctx, form);
  }
  return notFound(res, ctx);
}

function notFound(res, ctx) {
  send(res, 404, v.errorPage({ ...(ctx ? pageCtx(ctx) : {}), title: "Page Not Found", message: "We couldn't find that page." }));
}

setInterval(() => {
  const now = Date.now();
  for (const [k, p] of pending) if (p.expiresAt < now) pending.delete(k);
  for (const [k, s] of sessions) if (s.expiresAt < now) sessions.delete(k);
}, 60_000).unref();

http
  .createServer((req, res) =>
    handle(req, res).catch((e) => {
      console.error("[bank] error:", e instanceof Error ? e.message : e);
      if (!res.headersSent) send(res, 500, v.errorPage({ title: "Service Unavailable", message: "Something went wrong. Please try again later." }));
    }),
  )
  .listen(PORT, () => console.log(`Mock Bank on ${BANK_URL} (Secure at ${SECURE_URL})`));
