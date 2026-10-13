#!/usr/bin/env node
// Attack 3: relay with a forged origin (docs/phishing-demo.md).
//
// Worst case for the defender: the attacker has the victim's passkey PRIVATE KEY (exported
// from a CDP virtual authenticator), a fresh challenge from the real site, and a server that
// can forge the HTTP Origin header. The only thing they can't change is the origin the
// browser writes into clientDataJSON, because that is covered by the signature. The real
// server checks it and rejects the assertion (ORIGIN_MISMATCH, login_fail reason=origin_mismatch).
//
//   REAL_ORIGIN=http://localhost:3000 PHISH_PORT=3001 node attack3.mjs
//
// Exit code 0 = the attack was rejected as expected.
import { chromium } from "playwright";
import { forgeAssertion } from "./forge.mjs";

const REAL_ORIGIN = process.env.REAL_ORIGIN ?? "http://localhost:3000";
const PHISH_PORT = Number(process.env.PHISH_PORT ?? 3001);
const PHISH_ORIGIN = `http://127.0.0.1:${PHISH_PORT}`;
const RP_ID = new URL(REAL_ORIGIN).hostname;
const SKIP_CONTROL = process.argv.includes("--no-control");

const log = (...a) => console.log(...a);
const step = (n, s) => log(`\n[${n}] ${s}`);

async function realPost(path, body, cookie) {
  const res = await fetch(REAL_ORIGIN + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: REAL_ORIGIN, // forged: a server can send any Origin header it likes
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  const flow = res.headers.getSetCookie().find((c) => c.startsWith("flow="));
  return { status: res.status, json: await res.json().catch(() => ({})), flow: flow?.split(";")[0] };
}

async function main() {
  log(`Real site:  ${REAL_ORIGIN} (rpID ${RP_ID})`);
  log(`Phish site: ${PHISH_ORIGIN}`);

  step(1, "Victim signs up on the REAL site (Chromium + virtual authenticator).");
  const browser = await chromium.launch();
  let cred;
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });
    await page.goto(REAL_ORIGIN + "/");
    const handle = `victim_${Date.now().toString(36)}`;
    const reg = await page.evaluate(async (handle) => {
      const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
      const toB64u = (b) =>
        btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const post = (path, body) =>
        fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(
          async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }),
        );
      const o = await post("/api/auth/register/options", { handle, displayName: "Phish Victim" });
      if (o.status !== 200) return { error: `register/options ${o.status} ${JSON.stringify(o.json)}` };
      const opt = o.json.options;
      const c = await navigator.credentials.create({
        publicKey: {
          ...opt,
          challenge: fromB64u(opt.challenge),
          user: { ...opt.user, id: fromB64u(opt.user.id) },
          excludeCredentials: (opt.excludeCredentials ?? []).map((x) => ({ ...x, id: fromB64u(x.id) })),
        },
      });
      const response = {
        id: c.id,
        rawId: toB64u(c.rawId),
        type: c.type,
        clientExtensionResults: {},
        response: {
          clientDataJSON: toB64u(c.response.clientDataJSON),
          attestationObject: toB64u(c.response.attestationObject),
          transports: c.response.getTransports?.() ?? [],
        },
      };
      const v = await post("/api/auth/register/verify", { response });
      if (v.status !== 200) return { error: `register/verify ${v.status} ${JSON.stringify(v.json)}` };
      return { ok: true };
    }, handle);
    if (reg.error) throw new Error(`Couldn't register the victim on the real site: ${reg.error}`);
    log(`    registered @${handle}`);

    step(2, "Attacker steals the passkey's private key (CDP WebAuthn.getCredentials).");
    const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
    cred = credentials.find((c) => c.rpId === RP_ID);
    if (!cred) throw new Error("No credential in the virtual authenticator.");
    log(`    credential ${cred.credentialId.slice(0, 16)}…  signCount ${cred.signCount}  key ${cred.privateKey.length} b64 chars`);
  } finally {
    await browser.close();
  }

  const credentialId = Buffer.from(cred.credentialId, "base64").toString("base64url");
  const userHandle = cred.userHandle ? Buffer.from(cred.userHandle, "base64").toString("base64url") : null;
  let signCount = cred.signCount;

  async function attempt(origin) {
    const opts = await realPost("/api/auth/login/options");
    if (opts.status !== 200 || !opts.flow) throw new Error(`login/options ${opts.status} ${JSON.stringify(opts.json)}`);
    const { response, signatureValid } = forgeAssertion({
      privateKeyPkcs8: cred.privateKey,
      credentialId,
      userHandle,
      rpId: RP_ID,
      challenge: opts.json.options.challenge,
      origin,
      signCount: ++signCount,
    });
    log(`    challenge ${opts.json.options.challenge.slice(0, 16)}…  clientDataJSON.origin = ${origin}`);
    log(`    signature valid for the stolen key: ${signatureValid ? "yes" : "NO"}`);
    return realPost("/api/auth/login/verify", { response }, opts.flow);
  }

  step(3, "Phish server gets a real challenge, signs it as the phishing origin, posts it with a forged Origin header.");
  const atk = await attempt(PHISH_ORIGIN);
  log(`    → HTTP ${atk.status} ${JSON.stringify(atk.json)}`);
  const rejected = atk.json?.error?.code === "ORIGIN_MISMATCH";
  log(
    rejected
      ? "    ✅ REJECTED: ORIGIN_MISMATCH. The signed origin gives the phishing page away. See /admin: login_fail reason=origin_mismatch."
      : "    ❌ NOT rejected with ORIGIN_MISMATCH. Investigate!",
  );

  if (!SKIP_CONTROL) {
    step(4, "Control: same stolen key, same server trick, but clientDataJSON.origin = the real origin.");
    const ctl = await attempt(REAL_ORIGIN);
    log(`    → HTTP ${ctl.status} ${JSON.stringify(ctl.json)}`);
    log(
      ctl.status === 200
        ? "    (accepted: the key and signature were fine, ONLY the origin stopped step 3. A phishing page can't produce this.)"
        : "    (control was not accepted; step 3 is still valid on its own.)",
    );
  }
  process.exit(rejected ? 0 : 1);
}

main().catch((e) => {
  console.error(`\n💥 ${e.message}`);
  process.exit(2);
});
