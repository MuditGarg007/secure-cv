#!/usr/bin/env bash
# Start the dev servers in one terminal: bio (FastAPI :8000) + web (Next.js :3000) + landing page (:4321)
# + Mock Bank sample app (:4000, "Sign in with Secure").
# Usage: ./dev.sh [--phish]   (--phish also starts the phishing clone on :3001)
# Ctrl-C stops everything.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIO_PORT="${BIO_PORT:-8000}"
WEB_PORT="${WEB_PORT:-3000}"
PHISH_PORT="${PHISH_PORT:-3001}"
LANDING_PORT="${LANDING_PORT:-4321}"
BANK_PORT="${BANK_PORT:-4000}"

[[ -f "$ROOT/bio/.env" ]] || echo "warn: bio/.env missing (copy bio/.env.example)" >&2
[[ -f "$ROOT/web/.env.local" ]] || echo "warn: web/.env.local missing (copy web/.env.example)" >&2

trap 'trap - INT TERM EXIT; kill 0 2>/dev/null' INT TERM EXIT

run() {
  local name="$1" dir="$2"; shift 2
  (cd "$ROOT/$dir" && exec "$@") 2>&1 | sed -u "s/^/[$name] /" &
}

run bio bio uv run fastapi dev app/main.py --port "$BIO_PORT"
run web web pnpm dev --port "$WEB_PORT"
run landing landing python3 -m http.server "$LANDING_PORT"
PORT="$BANK_PORT" SECURE_URL="http://localhost:$WEB_PORT" run bank bank node server.mjs

if [[ "${1:-}" == "--phish" ]]; then
  REAL_ORIGIN="http://localhost:$WEB_PORT" PHISH_PORT="$PHISH_PORT" run phish phish pnpm start
fi

wait
