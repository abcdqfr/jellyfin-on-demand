#!/usr/bin/env python3
"""Live smoke against system Jellyfin public-config (no auth).

Fails if JellyfinOnDemand discovery is on but search chrome would stay disabled.
Waits for JF to finish restarting. Hard-fail if REQUIRE_LIVE=1 (deploy_verify).
Otherwise skip only when the host never becomes ready (offline laptop).
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

JF_URL = os.environ.get("JF_URL", "http://127.0.0.1:8096").rstrip("/")
REQUIRE_LIVE = os.environ.get("REQUIRE_LIVE", "").strip() in {"1", "true", "yes"}
WAIT_SECS = float(os.environ.get("LIVE_SMOKE_WAIT", "90"))


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def fetch_json(url: str, timeout: float = 5.0):
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return resp.status, json.loads(resp.read().decode())


def http_code(url: str, timeout: float = 5.0) -> int:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        return e.code


def wait_public_config():
    url = f"{JF_URL}/JellyfinOnDemand/public-config"
    deadline = time.monotonic() + WAIT_SECS
    last = None
    while time.monotonic() < deadline:
        try:
            code, body = fetch_json(url)
            if code == 200 and isinstance(body, dict):
                return body
            last = f"status {code}"
        except Exception as exc:  # noqa: BLE001 — retry until ready
            last = exc
        time.sleep(0.5)
    return None, last


def main() -> None:
    waited = wait_public_config()
    if isinstance(waited, tuple):
        _, last = waited
        msg = f"{JF_URL}/JellyfinOnDemand/public-config not ready after {WAIT_SECS:.0f}s ({last})"
        if REQUIRE_LIVE:
            fail(msg)
        print(f"SKIP: live_public_config_smoke ({msg})")
        return

    body = waited
    if body.get("JellyfinOnDemandDiscoveryEnabled") is True and body.get("JellyseerrShowSearchResults") is False:
        fail(
            "public-config: JellyfinOnDemandDiscoveryEnabled=true but JellyseerrShowSearchResults=false "
            "— search chrome will not initialize"
        )

    old = http_code(f"{JF_URL}/JellyfinEnhanced/public-config")
    new = http_code(f"{JF_URL}/JellyfinOnDemand/public-config")
    if old != 404:
        fail(f"/JellyfinEnhanced/public-config returned {old}, expected 404")
    if new != 200:
        fail(f"/JellyfinOnDemand/public-config returned {new}, expected 200")

    print(
        "PASS: live_public_config_smoke "
        f"(discovery={body.get('JellyfinOnDemandDiscoveryEnabled')} "
        f"showSearch={body.get('JellyseerrShowSearchResults')} "
        f"tmdb={body.get('TmdbEnabled')})"
    )


if __name__ == "__main__":
    main()
