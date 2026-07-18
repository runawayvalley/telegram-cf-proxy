import worker from '/home/bux/telegram-cf-proxy/src/index.js';

// ---- mock global fetch to capture the upstream request ----
let lastReq = null;
globalThis.fetch = async (input, init) => {
  let url, method, headers, body;
  if (input instanceof Request) {
    url = input.url; method = input.method;
    headers = Object.fromEntries(input.headers.entries()); body = input.body;
  } else {
    url = (input && input.url) || String(input);
    method = init && init.method;
    headers = Object.fromEntries((init && init.headers) || []);
    body = init && init.body;
  }
  lastReq = { url, method, headers, body };
  return new Response(JSON.stringify({ ok: true, result: { id: 1, username: 'testbot' } }), {
    status: 200,
    headers: new Headers({ 'content-type': 'application/json', 'content-length': '10', 'connection': 'keep-alive' }),
  });
};

function mkReq(url, opts = {}, headers = {}) {
  return new Request(url, { method: opts.method || 'GET', body: opts.body, headers: new Headers(headers) });
}

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra); }
}

async function run() {
  // 1. root info page
  let r = await worker.fetch(mkReq('https://w.test/'), {}, {});
  check('root returns 200 html', r.status === 200 && (r.headers.get('content-type')||'').includes('text/html'));

  // 2. passthrough /bot<TOKEN>/getMe
  r = await worker.fetch(mkReq('https://w.test/bot12345:TOKEN/getMe'), {}, {});
  if (r.status !== 200) { console.log('  >> body:', await r.text()); }
  check('passthrough status 200', r.status === 200);
  check('upstream url correct', lastReq.url === 'https://api.telegram.org/bot12345:TOKEN/getMe', lastReq.url);
  check('host header overridden', lastReq.headers['host'] === 'api.telegram.org', lastReq.headers['host']);
  check('hop-by-hop header stripped', lastReq.headers['connection'] === undefined);

  // 3. BOT_TOKEN injected
  const env = { BOT_TOKEN: '999:SECRET' };
  r = await worker.fetch(mkReq('https://w.test/getMe'), env, {});
  check('BOT_TOKEN injects prefix', lastReq.url === 'https://api.telegram.org/bot999:SECRET/getMe', lastReq.url);

  // 4. AUTH_KEY enforcement
  const env2 = { AUTH_KEY: 'topsecret' };
  r = await worker.fetch(mkReq('https://w.test/bot1:x/getMe'), env2, {});
  check('AUTH_KEY blocks missing key', r.status === 401);
  r = await worker.fetch(mkReq('https://w.test/bot1:x/getMe?key=topsecret'), env2, {});
  check('AUTH_KEY allows valid key', r.status === 200);
  check('key not forwarded upstream', !lastReq.url.includes('key='), lastReq.url);

  // 5. api_base override
  r = await worker.fetch(mkReq('https://w.test/bot1:x/getMe?api_base=https://self.host:8081'), {}, {});
  check('api_base override', lastReq.url === 'https://self.host:8081/bot1:x/getMe', lastReq.url);

  // 6. POST body streams
  r = await worker.fetch(mkReq('https://w.test/bot1:x/sendMessage', { method: 'POST', body: '{"x":1}' }, { 'content-type': 'application/json' }), {}, {});
  if (r.status !== 200) console.log('  >> POST body:', await r.text());
  check('POST passes through', r.status === 200 && lastReq.method === 'POST' && lastReq.body != null, `status=${r.status} body=${lastReq && lastReq.body}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
run();
