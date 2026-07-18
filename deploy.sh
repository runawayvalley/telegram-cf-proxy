#!/usr/bin/env bash
#
# telegram-cf-proxy — one-shot deploy script.
#
# 1) Authenticate (pick ONE):
#      A) API Token (recommended — give it "Account:Workers Scripts" + "Zone:Workers"):
#           export CLOUDFLARE_API_TOKEN=...
#      B) Global API Key (legacy):
#           export CLOUDFLARE_API_KEY=...
#           export CLOUDFLARE_EMAIL=you@example.com
#
# 2) (Optional) configure secrets the Worker will use:
#      export BOT_TOKEN=...    # lets clients omit the /bot<TOKEN> prefix
#      export AUTH_KEY=...     # required on every request (?key= or X-Auth-Key)
#
# 3) Run:  ./deploy.sh
#
set -euo pipefail

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && [ -z "${CLOUDFLARE_API_KEY:-}" ]; then
  echo "ERROR: set CLOUDFLARE_API_TOKEN (or CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL) first." >&2
  exit 1
fi

echo ">> Publishing secrets (if provided)…"
if [ -n "${BOT_TOKEN:-}" ]; then
  printf '%s' "$BOT_TOKEN" | npx wrangler secret put BOT_TOKEN
fi
if [ -n "${AUTH_KEY:-}" ]; then
  printf '%s' "$AUTH_KEY" | npx wrangler secret put AUTH_KEY
fi

echo ">> Deploying Worker…"
npx wrangler deploy "$@"
echo ">> Done. Your proxy is live at the URL printed above."
