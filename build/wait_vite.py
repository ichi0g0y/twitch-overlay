#!/usr/bin/env python3
import os
import sys
import time
import urllib.request
import urllib.error


def main() -> int:
    port = (os.environ.get("VITE_PORT") or "").strip()
    if not port:
        # Wails sets FRONTEND_DEVSERVER_URL like http://localhost:9245
        fe_url = (os.environ.get("FRONTEND_DEVSERVER_URL") or "").strip()
        if fe_url:
            try:
                # Very small parser: grab ":<port>".
                parts = fe_url.split(":")
                if len(parts) >= 3:
                    port = parts[-1].split("/")[0]
            except Exception:
                port = ""
    if not port:
        port = "9245"
    url = f"http://localhost:{port}/"

    # Keep it short: Wails will already retry, this just prevents an immediate fail.
    timeout_s = float(os.environ.get("VITE_WAIT_SECONDS", "12"))
    deadline = time.time() + max(0.1, timeout_s)

    while time.time() < deadline:
        try:
            # Viteは Accept: text/html が無いと / を 404 にすることがあるため、
            # HTMLを明示して「ブラウザのアクセス」と同じ条件で疎通を確認するだす。
            req = urllib.request.Request(
                url,
                headers={
                    "Accept": "text/html",
                    "User-Agent": "wails-vite-wait/1.0",
                },
            )
            with urllib.request.urlopen(req, timeout=0.5):
                return 0
        except urllib.error.HTTPError:
            # サーバーは応答しているので起動済み扱いにするだす。
            return 0
        except Exception:
            time.sleep(0.1)

    print(f"Vite dev server が起動しないだす: {url}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
