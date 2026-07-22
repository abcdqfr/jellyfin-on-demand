#!/usr/bin/env python3
"""Search history API round-trip against system Jellyfin (JF_URL). Needs JF_USER/JF_PASS."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
import uuid

BASE = os.environ.get("JF_URL", "http://127.0.0.1:8096").rstrip("/")
USER = os.environ.get("JF_USER", "")
PASS = os.environ.get("JF_PASS", "")


def fail(msg: str) -> None:
    print(msg, file=sys.stderr)
    raise SystemExit(1)


def http_json(method: str, url: str, body=None, token: str | None = None, timeout: float = 30.0):
    data = None if body is None else json.dumps(body).encode()
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Emby-Authorization": (
            'MediaBrowser Client="jellyfin-on-demand-history-smoke", Device="smoke", '
            'DeviceId="jellyfin-on-demand-history-smoke", Version="0.2.0"'
        ),
    }
    if token:
        headers["X-Emby-Token"] = token
        headers["X-MediaBrowser-Token"] = token
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw.decode()) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            parsed = json.loads(raw.decode()) if raw else None
        except Exception:
            parsed = raw.decode(errors="replace") if raw else None
        return e.code, parsed


def main() -> None:
    if not USER or not PASS:
        fail("set JF_USER and JF_PASS for history smoke")

    st, body = http_json("POST", BASE + "/Users/authenticatebyname", {"Username": USER, "Pw": PASS})
    if st != 200 or not isinstance(body, dict) or not body.get("AccessToken"):
        fail(f"auth failed: {st} {body}")
    token = body["AccessToken"]

    marker = f"jellyfin-on-demand-history-smoke-{uuid.uuid4().hex[:12]}"
    st, upserted = http_json(
        "POST",
        BASE + "/JellyfinOnDemand/swarm/history",
        {
            "Query": marker,
            "MediaType": "movie",
            "Title": "History Smoke Title",
            "Year": "2026",
            "TmdbId": 900001,
        },
        token=token,
    )
    if st != 200 or not isinstance(upserted, dict):
        fail(f"POST history failed: {st} {upserted}")
    entry_id = upserted.get("Id") or upserted.get("id")
    if not entry_id:
        fail(f"POST history missing id: {upserted}")

    st, listed = http_json("GET", BASE + "/JellyfinOnDemand/swarm/history", token=token)
    if st != 200 or not isinstance(listed, dict):
        fail(f"GET history failed: {st} {listed}")
    entries = listed.get("entries") or listed.get("Entries") or []
    found = next(
        (
            e
            for e in entries
            if (e.get("Id") or e.get("id")) == entry_id
            or (e.get("Query") or e.get("query")) == marker
        ),
        None,
    )
    if not found:
        fail(f"GET history missing upserted entry {entry_id}: {entries[:5]}")

    st, _ = http_json("DELETE", BASE + f"/JellyfinOnDemand/swarm/history/{entry_id}", token=token)
    if st not in (200, 204):
        fail(f"DELETE history failed: {st}")

    st, listed2 = http_json("GET", BASE + "/JellyfinOnDemand/swarm/history", token=token)
    if st != 200 or not isinstance(listed2, dict):
        fail(f"GET history after delete failed: {st} {listed2}")
    entries2 = listed2.get("entries") or listed2.get("Entries") or []
    if any((e.get("Id") or e.get("id")) == entry_id for e in entries2):
        fail("deleted history entry still present")

    print(f"OK history round-trip id={entry_id} query={marker}")


if __name__ == "__main__":
    main()
