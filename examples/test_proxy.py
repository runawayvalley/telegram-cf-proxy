#!/usr/bin/env python3
"""Quick smoke test for telegram-cf-proxy.

Usage:
    python examples/test_proxy.py <WORKER_URL> <BOT_TOKEN> [CHAT_ID]

Example:
    python examples/test_proxy.py https://tg-proxy.my.workers.dev 123456:ABC... 5550123

If you configured AUTH_KEY on the Worker, set it via the KEY env var:
    KEY=supersecret python examples/test_proxy.py <WORKER_URL> <BOT_TOKEN> <CHAT_ID>
"""
import sys
import os
import json
import urllib.request
import urllib.error


def call(base, method, token, params=None, timeout=20):
    url = f"{base.rstrip('/')}/bot{token}/{method}"
    data = json.dumps(params or {}).encode()
    headers = {"content-type": "application/json"}
    key = os.environ.get("KEY")
    if key:
        url += f"?key={key}"
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    base, token = sys.argv[1], sys.argv[2]
    chat = sys.argv[3] if len(sys.argv) > 3 else None

    print(f"[*] Worker base : {base}")
    me = call(base, "getMe", token)
    if not me.get("ok"):
        print("[!] getMe failed:", me)
        sys.exit(1)
    bot = me["result"]
    print(f"[+] getMe OK -> @{bot['username']} (id={bot['id']})")

    if chat:
        sent = call(base, "sendMessage", token,
                    {"chat_id": chat, "text": "✅ telegram-cf-proxy is working!"})
        if sent.get("ok"):
            print(f"[+] sendMessage OK -> message_id={sent['result']['message_id']}")
        else:
            print("[!] sendMessage failed:", sent)
            sys.exit(1)
    else:
        print("[*] No CHAT_ID given — skipping sendMessage test.")

    print("\nAll checks passed 🎉")


if __name__ == "__main__":
    main()
