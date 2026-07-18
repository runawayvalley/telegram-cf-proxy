# telegram-cf-proxy

A **drop-in Cloudflare Worker reverse proxy for the Telegram Bot API** (and any
Telegram-like API server). Point your bot at the Worker URL instead of
`https://api.telegram.org` and it forwards everything unchanged — letting you
reach Telegram from networks/regions where the official endpoint is blocked or
unreliable.

> ⚠️ **What this is and isn't.** This proxies *Bot API* traffic (server →
> `api.telegram.org`). It does **not** proxy the *MTProto* client protocol that
> the official Telegram apps use, so it won't unblock the Telegram *app* itself.
> It also can't hide your bot token from Telegram — Telegram still needs a valid
> token to respond. What it *does* do: route your bot's HTTPS calls through a
> Cloudflare edge endpoint that your infrastructure *can* reach.

---

## 🚀 Quick start (3 steps)

### 1. Create the GitHub repo + push this code
```bash
gh repo create telegram-cf-proxy --public --source . --remote origin --push
```
(already done if you cloned this repo)

### 2. Deploy the Worker
**Option A — automated via Cloudflare API key/token (no `wrangler` login needed):**
```bash
export CLOUDFLARE_API_TOKEN=your_api_token   # OR CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL
./deploy.sh
```
Set `BOT_TOKEN` / `AUTH_KEY` env vars before running to bake them in (recommended).

**Option B — interactive (you're already logged into `wrangler`):**
```bash
npx wrangler login
npx wrangler deploy
```

After deploy you'll get a URL like:
```
https://telegram-cf-proxy.<your-subdomain>.workers.dev
```

### 3. Point your bot at the proxy
Replace:
```
https://api.telegram.org/bot<TOKEN>/getMe
```
with:
```
https://telegram-cf-proxy.<your-subdomain>.workers.dev/bot<TOKEN>/getMe
```
That's it — **every** Bot API method works the same way (`sendMessage`, `getUpdates`,
`sendPhoto`, webhook delivery, file uploads, etc.).

---

## ✅ Test it

```bash
python examples/test_proxy.py <WORKER_URL> <BOT_TOKEN> <CHAT_ID>
# e.g.
python examples/test_proxy.py https://tg-proxy.my.workers.dev 123456:ABCdef 55501234
```
It calls `getMe`, then optionally `sendMessage`. If you set `AUTH_KEY`, export it:
`KEY=secret python examples/test_proxy.py …`.

---

## 🔧 Configuration

**All configuration is optional.** The Worker runs with zero secrets/vars set —
clients just use the standard `https://<worker>/bot<TOKEN>/...` form and the
proxy forwards to `https://api.telegram.org`. Each value only changes behavior;
nothing is required.

Set these **secrets** (not committed to the repo) with
`npx wrangler secret put <NAME>`:

| Secret      | Required? | If **set**                                                            | If **unset** (default)                                            |
|-------------|-----------|-----------------------------------------------------------------------|-------------------------------------------------------------------|
| `BOT_TOKEN` | ❌ optional | Clients may **omit** the `/bot<TOKEN>` prefix entirely.               | Clients **must** include `/bot<TOKEN>` in the path (standard form).|
| `AUTH_KEY`  | ❌ optional | **Every** request must carry `?key=<AUTH_KEY>` (or `X-Auth-Key` header). The proxy is locked down. | Proxy is **open** — anyone who knows the URL can use it. ⚠️ Don't leave public `*.workers.dev` URLs open. |

Set this **var** in `wrangler.toml` (always has a value even if you delete the line):

| Var                   | Default                       | Required? | Effect                                    |
|-----------------------|-------------------------------|-----------|-------------------------------------------|
| `TELEGRAM_API_BASE`   | `https://api.telegram.org`    | ❌ optional | Upstream base URL.                        |

### Per-request overrides (query params)
| Param                  | Effect                                                                |
|------------------------|-----------------------------------------------------------------------|
| `?api_base=URL`        | Proxy to a different upstream this one time (e.g. a self-hosted Bot API server). |
| `?key=...`             | Auth key (only required when `AUTH_KEY` is configured).               |

---

## 🛡️ Security notes

- **Always set `AUTH_KEY` in production.** Without it, the proxy is open and will
  forward *any* bot token to Telegram on anyone's behalf (an open relay).
- Cloudflare logs request metadata (URLs, headers) by default — your bot token
  appears in the URL path. Use `BOT_TOKEN` so clients never put the token in the
  URL, and consider Cloudflare's "Disable Logging" setting for the route.
- For a stable, non-guessable endpoint, attach a **custom domain** (see
  `wrangler.toml` `routes` example) instead of the default `*.workers.dev` name.

---

## 🧩 Use with popular libraries

Most Telegram bot libraries let you override the API base URL:

```python
# python-telegram-bot
from telegram import Bot
bot = Bot(token, api_url="https://telegram-cf-proxy.<sub>.workers.dev/bot")
```

```javascript
// grammY / node-telegram-bot-api
// grammY:
const bot = new Bot(token, { apiRoot: "https://telegram-cf-proxy.<sub>.workers.dev" });
// node-telegram-bot-api:
const bot = new TelegramBot(token, { baseApiUrl: "https://telegram-cf-proxy.<sub>.workers.dev" });
```

---

## 🗂️ Project layout

```
telegram-cf-proxy/
├── src/index.js              # the Worker (reverse proxy logic)
├── wrangler.toml            # Worker config + vars
├── deploy.sh                # one-shot deploy via API token/key
├── examples/test_proxy.py   # getMe + sendMessage smoke test
├── .github/workflows/       # optional CI/CD on push
└── README.md
```

## 📄 License
MIT — see [LICENSE](LICENSE).
