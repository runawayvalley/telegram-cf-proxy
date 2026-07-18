/**
 * telegram-cf-proxy
 * -----------------
 * A drop-in Cloudflare Worker reverse proxy for the Telegram Bot API
 * (and any Telegram-like API server).
 *
 * DROP-IN USAGE
 *   Replace `https://api.telegram.org` with your Worker URL:
 *     https://<worker>.<subdomain>.workers.dev/bot<TOKEN>/getMe
 *
 * OPTIONAL FEATURES (configure via wrangler `secret put` / `[vars]`):
 *   BOT_TOKEN  — when set, clients may OMIT the /bot<TOKEN> path prefix.
 *                e.g.  https://<worker>/sendMessage?chat_id=123&text=hi
 *   AUTH_KEY   — when set, every request must carry ?key=<AUTH_KEY>
 *                (or the `X-Auth-Key` header). Use this to keep the proxy
 *                from being abused by anyone who discovers the URL.
 *   TELEGRAM_API_BASE (var) — upstream base URL (default api.telegram.org).
 *   ?api_base= — per-request upstream override, e.g. a self-hosted
 *                Bot API server: ?api_base=https://bot-api.internal:8081
 *
 * SECURITY NOTE
 *   Without AUTH_KEY, the proxy is open to the world and will happily
 *   forward any bot token to Telegram. Always set AUTH_KEY in production,
 *   and remember Cloudflare logs request metadata (URLs/headers) by default.
 */

const DEFAULT_API_BASE =
  (typeof TELEGRAM_API_BASE !== 'undefined' && TELEGRAM_API_BASE)
    ? TELEGRAM_API_BASE
    : 'https://api.telegram.org';

// Headers that must NOT be forwarded to the upstream (hop-by-hop / managed by the runtime).
const FORBIDDEN_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade', 'host', 'content-length',
]);

function cleanHeaders(headers) {
  const out = new Headers();
  for (const [k, v] of headers.entries()) {
    if (FORBIDDEN_HOP.has(k.toLowerCase())) continue;
    out.set(k, v);
  }
  return out;
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await handle(request, env);
    } catch (err) {
      return json(
        { ok: false, error_code: 500, description: String((err && err.message) || err) },
        500,
      );
    }
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

async function handle(request, env) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  // ---- root: info page / CORS preflight ----
  if (url.pathname === '/' || url.pathname === '') {
    if (method === 'OPTIONS') return preflight();
    if (method === 'GET') return infoPage();
  }
  if (method === 'OPTIONS') return preflight();

  // ---- optional access control ----
  if (env.AUTH_KEY) {
    const provided =
      url.searchParams.get('key') || request.headers.get('X-Auth-Key') || '';
    if (provided !== env.AUTH_KEY) {
      return new Response('Unauthorized', { status: 401 });
    }
    url.searchParams.delete('key'); // don't leak it upstream
  }

  // ---- upstream selection ----
  let apiBase = DEFAULT_API_BASE;
  const apiParam = url.searchParams.get('api_base') || url.searchParams.get('api');
  if (apiParam) {
    apiBase = apiParam.replace(/\/+$/, '');
    url.searchParams.delete('api_base');
    url.searchParams.delete('api');
  }

  // ---- path / token handling ----
  let pathname = url.pathname;
  // A path already carries a token if it starts with /bot<TOKEN> or /file/bot<TOKEN>.
  const hasBotPrefix = /^\/(file\/)?bot[\d:]/.test(pathname);
  if (env.BOT_TOKEN && !hasBotPrefix) {
    const clean = pathname.replace(/^\/+/, '');
    if (clean === '') return infoPage();
    const prefix = clean.startsWith('file') ? 'file/bot' : 'bot';
    pathname = '/' + prefix + env.BOT_TOKEN + '/' + clean.replace(/^(file\/)?/, '');
  }

  const upstream = new URL(apiBase + pathname + (url.search || ''));

  // ---- build upstream request ----
  const headers = cleanHeaders(request.headers);
  headers.set('host', upstream.host); // must match the upstream for TLS/SNI

  const init = {
    method,
    headers,
    redirect: 'follow',
  };
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = request.body; // stream the body through unchanged
    // Required by the Workers runtime (and undici) when passing a ReadableStream body.
    init.duplex = 'half';
  }

  const upstreamReq = new Request(upstream, init);

  // ---- fetch upstream ----
  const resp = await fetch(upstreamReq);

  // ---- response (with permissive CORS so browser clients work too) ----
  const outHeaders = cleanHeaders(resp.headers);
  outHeaders.set('access-control-allow-origin', '*');
  outHeaders.set('access-control-allow-headers', '*');
  outHeaders.set('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (!outHeaders.has('content-type')) {
    outHeaders.set('content-type', resp.headers.get('content-type') || 'application/json');
  }

  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers: outHeaders,
  });
}

function preflight() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    },
  });
}

function infoPage() {
  const body = `<!doctype html>
<html><head><meta charset="utf-8"><title>telegram-cf-proxy</title>
<style>body{font-family:system-ui,sans-serif;max-width:700px;margin:40px auto;padding:0 16px;line-height:1.6}
code{background:#eee;padding:2px 6px;border-radius:4px}pre{background:#f6f6f6;padding:12px;border-radius:8px;overflow:auto}</style>
</head><body>
<h1>telegram-cf-proxy</h1>
<p>A drop-in Cloudflare Worker reverse proxy for the Telegram Bot API.</p>
<p>Replace <code>https://api.telegram.org</code> with this Worker URL:</p>
<pre>https://&lt;this-worker&gt;/bot&lt;TOKEN&gt;/getMe</pre>
<p>Optional query params:</p>
<ul>
<li><code>?api_base=https://my-bot-api.example.com</code> — proxy to a different (self-hosted) API.</li>
<li><code>?key=&lt;AUTH_KEY&gt;</code> — required when the <code>AUTH_KEY</code> secret is set.</li>
</ul>
<p>See the repository <strong>README</strong> for full documentation and examples.</p>
</body></html>`;
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
