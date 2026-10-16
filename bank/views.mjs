// Server-rendered HTML for the mock bank. Deliberately 2010s: fixed 960px layout, tables, gradients.

export const h = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const money = (cents) => usd.format(cents / 100);
const dateFmt = new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
export const date = (ms) => dateFmt.format(ms);
export const dateTime = (ms) => dateTimeFmt.format(ms);
const masked = (number) => `••••${number.slice(-4)}`;

export function methodLabel(amr = []) {
  return amr.includes("face") ? "Passkey + Face + Hand gesture" : "Passkey";
}

const LOGO = `<svg class="logo-mark" viewBox="0 0 48 48" aria-hidden="true">
  <path d="M24 4 4 14v4h40v-4z" fill="#0b3a6e"/><rect x="8" y="20" width="5" height="16" fill="#1c5aa0"/>
  <rect x="17" y="20" width="5" height="16" fill="#1c5aa0"/><rect x="26" y="20" width="5" height="16" fill="#1c5aa0"/>
  <rect x="35" y="20" width="5" height="16" fill="#1c5aa0"/><rect x="4" y="38" width="40" height="6" fill="#0b3a6e"/>
  <circle cx="24" cy="12" r="2.5" fill="#f2a516"/></svg>`;

const LOCK = `<svg class="lock" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 7V5a4 4 0 0 1 8 0v2h1v8H3V7zm2 0h4V5a2 2 0 0 0-4 0z" fill="#3a7a1f"/></svg>`;

function nav(customer, active) {
  const items = customer
    ? [["/accounts", "Accounts"], ["/transfer", "Transfers"], ["/security", "Security Center"]]
    : [["/", "Personal"], ["#", "Small Business"], ["#", "Loans"], ["#", "Credit Cards"], ["#", "Investing"]];
  return `<ul class="nav">${items
    .map(([href, label]) => `<li${active === href ? ' class="on"' : ""}><a href="${href}">${label}</a></li>`)
    .join("")}</ul>`;
}

export function layout({ title, customer, csrf, active, body }) {
  const util = customer
    ? `<span>Welcome, <b>${h(customer.name)}</b></span> |
       <form method="post" action="/logout" class="inline"><input type="hidden" name="csrf" value="${h(csrf)}">
       <button class="linkbtn">Sign Off</button></form>`
    : `<a href="#">Locations</a> | <a href="#">Contact Us</a> | <a href="#">Español</a>
       <input class="search" placeholder="Search" disabled>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${h(title)} - Mock Bank of Localhost</title>
<link rel="stylesheet" href="/style.css">
</head>
<body>
<div id="wrap">
  <div id="header">
    <a href="/" class="logo">${LOGO}<span class="logo-text">Mock Bank<small>of Localhost</small></span></a>
    <div class="util">${util}</div>
  </div>
  ${nav(customer, active)}
  <div id="content">${body}</div>
  <div id="footer">
    <p><a href="#">Privacy</a> | <a href="#">Security</a> | <a href="#">Terms of Use</a> | <a href="#">Accessibility</a> | <a href="#">Site Map</a></p>
    <p>&copy; 2011&ndash;2026 Mock Bank of Localhost. Not a real bank. A sample app for <b>Secure</b> passwordless sign-in.</p>
    <p class="tiny">Best viewed in 1024&times;768 or higher.</p>
  </div>
</div>
</body>
</html>`;
}

const notice = (msg, kind = "info") => (msg ? `<div class="notice ${kind}">${h(msg)}</div>` : "");

export function homePage({ msg }) {
  return layout({
    title: "Personal Banking",
    active: "/",
    body: `
<div class="cols">
  <div class="main">
    <div class="hero">
      <h1>Banking with <em>no passwords.</em></h1>
      <p>Mock Bank now signs you in with a <b>passkey</b> on your phone or computer.
      Nothing to remember, nothing to steal, nothing to phish.</p>
      <a class="btn orange" href="/login">Get Started &raquo;</a>
    </div>
    <div class="promos">
      <div class="promo"><h3>Free Checking</h3><p>No monthly fee with direct deposit. Earn interest on every dollar.</p><a href="#">Learn more &raquo;</a></div>
      <div class="promo"><h3>Home Loans</h3><p>Rates as low as <b>3.25% APR</b>*. Talk to a loan officer today.</p><a href="#">See rates &raquo;</a></div>
      <div class="promo"><h3>Big Transfer Shield</h3><p>Transfers over $1,000 need your passkey <i>and</i> a quick face + hand-sign check.</p><a href="#">How it works &raquo;</a></div>
    </div>
    <p class="tiny">*Not an actual offer. This is a demo bank. Rates shown are for illustrative purposes only.</p>
  </div>
  <div class="side">
    <div class="box login">
      <div class="box-h">${LOCK} Online Banking</div>
      <div class="box-b">
        ${notice(msg, "error")}
        <p>Sign on to view your accounts.</p>
        <a class="btn blue wide" href="/login">Sign On with Secure</a>
        <p class="small">Your device will ask for your fingerprint, face or screen lock. <b>No password needed.</b></p>
        <hr>
        <p class="small"><a href="#">Forgot your password?</a><br><span class="muted">(We don't have those anymore.)</span></p>
        <p class="small">New to Mock Bank? Your accounts are opened automatically the first time you sign on.</p>
      </div>
    </div>
    <div class="box">
      <div class="box-h">Security Alert</div>
      <div class="box-b small">We will <b>never</b> ask for a password or a one-time code by email, SMS or phone. If someone does, it isn't us.</div>
    </div>
  </div>
</div>`,
  });
}

function sidebar() {
  return `
  <div class="side">
    <div class="box">
      <div class="box-h">Quick Links</div>
      <div class="box-b"><ul class="links">
        <li><a href="/transfer">Transfer Funds</a></li>
        <li><a href="/security">Security Center</a></li>
        <li><a href="#">Bill Pay</a> <span class="muted">(coming soon)</span></li>
        <li><a href="#">Order Checks</a></li>
      </ul></div>
    </div>
    <div class="box">
      <div class="box-h">${LOCK} Protected by Secure</div>
      <div class="box-b small">You signed on with a passkey. Mock Bank never sees a password, your fingerprint or your face.</div>
    </div>
  </div>`;
}

export function accountsPage({ customer, csrf, accounts, msg }) {
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  const last = customer.previousLogin;
  return layout({
    title: "Account Summary",
    customer,
    csrf,
    active: "/accounts",
    body: `
<div class="cols">
  <div class="main">
    <h2>Account Summary</h2>
    ${notice(msg)}
    <p class="small muted">${
      last ? `Last sign-on: ${h(dateTime(last.at))} using ${h(methodLabel(last.amr))}` : "Welcome to Mock Bank! This is your first sign-on."
    }</p>
    <table class="grid">
      <tr><th>Account</th><th>Account Number</th><th class="r">Available Balance</th></tr>
      ${accounts
        .map(
          (a, i) => `<tr class="${i % 2 ? "alt" : ""}"><td><a href="/accounts/${h(a.id)}">${h(a.name)}</a></td>
          <td>${masked(a.number)}</td><td class="r">${money(a.balance)}</td></tr>`,
        )
        .join("")}
      <tr class="total"><td colspan="2">Total</td><td class="r">${money(total)}</td></tr>
    </table>
    <p><a class="btn orange" href="/transfer">Transfer Funds</a></p>
  </div>
  ${sidebar()}
</div>`,
  });
}

export function accountPage({ customer, csrf, account, transactions }) {
  return layout({
    title: account.name,
    customer,
    csrf,
    active: "/accounts",
    body: `
<div class="cols">
  <div class="main">
    <p class="crumbs"><a href="/accounts">Account Summary</a> &gt; ${h(account.name)}</p>
    <h2>${h(account.name)} <span class="muted small">${masked(account.number)}</span></h2>
    <p>Available balance: <b class="big">${money(account.balance)}</b></p>
    <table class="grid">
      <tr><th>Date</th><th>Description</th><th class="r">Amount</th><th class="r">Balance</th></tr>
      ${transactions
        .map(
          (t, i) => `<tr class="${i % 2 ? "alt" : ""}"><td>${date(t.at)}</td><td>${h(t.description)}</td>
          <td class="r ${t.amount < 0 ? "neg" : "pos"}">${money(t.amount)}</td><td class="r">${money(t.balance)}</td></tr>`,
        )
        .join("")}
    </table>
  </div>
  ${sidebar()}
</div>`,
  });
}

export function transferPage({ customer, csrf, accounts, msg, form = {}, stepUpOver }) {
  const opt = (a, sel) =>
    `<option value="${h(a.id)}"${sel === a.id ? " selected" : ""}>${h(a.name)} ${masked(a.number)} (${money(a.balance)})</option>`;
  const toOwn = form.to ? (form.to === "payee" ? "" : form.to) : accounts[1]?.id;
  return layout({
    title: "Transfer Funds",
    customer,
    csrf,
    active: "/transfer",
    body: `
<div class="cols">
  <div class="main">
    <h2>Transfer Funds</h2>
    ${notice(msg, "error")}
    <form method="post" action="/transfer" class="form">
      <input type="hidden" name="csrf" value="${h(csrf)}">
      <table class="formtable">
        <tr><td class="lbl"><label for="from">From:</label></td>
          <td><select id="from" name="from">${accounts.map((a) => opt(a, form.from)).join("")}</select></td></tr>
        <tr><td class="lbl"><label for="to">To:</label></td>
          <td><select id="to" name="to">
            ${accounts.map((a) => opt(a, toOwn)).join("")}
            <option value="payee"${form.to === "payee" ? " selected" : ""}>Another Mock Bank customer...</option>
          </select></td></tr>
        <tr><td class="lbl"><label for="payee">Recipient username:</label></td>
          <td><input id="payee" name="payee" value="${h(form.payee)}" placeholder="e.g. bob" size="20">
          <span class="small muted">Only if sending to another customer</span></td></tr>
        <tr><td class="lbl"><label for="amount">Amount:</label></td>
          <td>$ <input id="amount" name="amount" value="${h(form.amount)}" size="10" placeholder="0.00" required></td></tr>
        <tr><td class="lbl"><label for="memo">Memo:</label></td>
          <td><input id="memo" name="memo" value="${h(form.memo)}" size="30" maxlength="30" placeholder="Optional"></td></tr>
        <tr><td></td><td><button class="btn orange">Continue &raquo;</button> <a href="/accounts">Cancel</a></td></tr>
      </table>
    </form>
    <div class="notice warn">
      <b>Big Transfer Shield:</b> transfers over ${money(stepUpOver)} are sent to Secure for approval.
      You'll confirm with your passkey and a quick face + hand-sign check. Mock Bank never sees your face.
    </div>
  </div>
  ${sidebar()}
</div>`,
  });
}

export function receiptPage({ customer, csrf, t, from, to, toName }) {
  return layout({
    title: "Transfer Confirmation",
    customer,
    csrf,
    active: "/transfer",
    body: `
<div class="cols">
  <div class="main">
    <h2>Transfer Confirmation</h2>
    <div class="notice ok">Your transfer has been completed.</div>
    <table class="grid kv">
      <tr><th>Confirmation #</th><td><b>${h(t.ref)}</b></td></tr>
      <tr class="alt"><th>Date</th><td>${h(dateTime(t.at))}</td></tr>
      <tr><th>From</th><td>${h(from.name)} ${masked(from.number)}</td></tr>
      <tr class="alt"><th>To</th><td>${h(toName)} ${masked(to.number)}</td></tr>
      <tr><th>Amount</th><td><b>${money(t.amount)}</b></td></tr>
      <tr class="alt"><th>Memo</th><td>${h(t.memo || "-")}</td></tr>
      <tr><th>Verified with</th><td>${LOCK} ${h(t.verifiedWith)}</td></tr>
    </table>
    <p><a class="btn blue" href="/accounts">Back to Accounts</a> <a href="/transfer">Make another transfer</a></p>
  </div>
  ${sidebar()}
</div>`,
  });
}

export function securityPage({ customer, csrf, session, secureUrl }) {
  const row = (label, info) =>
    info ? `${h(dateTime(info.at))} &mdash; ${h(methodLabel(info.amr))}` : `<span class="muted">${label}</span>`;
  return layout({
    title: "Security Center",
    customer,
    csrf,
    active: "/security",
    body: `
<div class="cols">
  <div class="main">
    <h2>Security Center</h2>
    <table class="grid kv">
      <tr><th>Sign-on method</th><td>${LOCK} Passkey via Secure (no password on file)</td></tr>
      <tr class="alt"><th>This session</th><td>${row("", { at: session.authTime, amr: session.amr })}</td></tr>
      <tr><th>Previous sign-on</th><td>${row("None", customer.previousLogin)}</td></tr>
      <tr class="alt"><th>Secure username</th><td>@${h(customer.handle)}</td></tr>
      <tr><th>Big transfers</th><td>Passkey + face + hand-sign check</td></tr>
    </table>
    <h3>Manage your sign-in</h3>
    <p>Your passkeys, devices, face check and recovery code are managed by Secure, not by Mock Bank.</p>
    <ul class="links">
      <li><a href="${h(secureUrl)}/devices" target="_blank" rel="noopener">Manage passkeys &amp; devices</a> (opens Secure)</li>
      <li><a href="${h(secureUrl)}/activity" target="_blank" rel="noopener">See sign-in activity</a> (opens Secure)</li>
      <li><a href="${h(secureUrl)}/security" target="_blank" rel="noopener">Set up face + hand-sign check</a> (needed for big transfers)</li>
    </ul>
  </div>
  ${sidebar()}
</div>`,
  });
}

export function errorPage({ customer, csrf, title, message }) {
  return layout({
    title,
    customer,
    csrf,
    body: `<h2>${h(title)}</h2><div class="notice error">${h(message)}</div>
<p><a class="btn blue" href="${customer ? "/accounts" : "/"}">Continue</a></p>`,
  });
}
