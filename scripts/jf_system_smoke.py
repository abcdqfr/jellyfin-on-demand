#!/usr/bin/env python3
"""Play-bind smoke against system Jellyfin (JF_URL). Needs JF_USER/JF_PASS."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import quote

import libtorrent as lt

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "third-party/vlc-bittorrent/test/data"
TORRENT_PATH = DATA_DIR / "sweden.png.torrent"
DATA_FILE = DATA_DIR / "sweden.png"
INFOHASH = "fce002e43ed1159f4612982ce8fcdb9d30e48f1e"
EXPECTED_SIZE = 636
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
        "X-Emby-Authorization": 'MediaBrowser Client="swarmplay-smoke", Device="smoke", DeviceId="swarmplay-system-smoke", Version="0.1.0"',
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
        fail("set JF_USER and JF_PASS for system play-bind smoke")
    if DATA_FILE.stat().st_size != EXPECTED_SIZE:
        fail("bad fixture size")

    st, body = http_json("POST", BASE + "/Users/authenticatebyname", {"Username": USER, "Pw": PASS})
    if st != 200 or not isinstance(body, dict) or not body.get("AccessToken"):
        fail(f"auth failed: {st} {body}")
    token = body["AccessToken"]

    cache = Path(os.environ.get("SWARMPLAY_CACHE_DIR", "/home/brandon/cache/swarmplay"))
    download = cache / INFOHASH
    # leave existing; ensure will reuse

    ti = lt.torrent_info(str(TORRENT_PATH))
    ses = lt.session({"listen_interfaces": "127.0.0.1:0"})
    h = ses.add_torrent({"ti": ti, "save_path": str(DATA_DIR)})
    deadline = time.monotonic() + 10
    while not h.status().is_seeding and time.monotonic() < deadline:
        time.sleep(0.1)
    if not h.status().is_seeding:
        fail("seeder not ready")
    port = ses.listen_port()
    magnet = f"magnet:?xt=urn:btih:{INFOHASH}&x.pe={quote(f'127.0.0.1:{port}')}"

    st, body = http_json(
        "POST",
        BASE + "/Swarmplay/swarm/play-bind",
        {
            "Magnet": magnet,
            "Btih": INFOHASH,
            "FileIndex": 0,
            "TailMib": 1,
            "HeadMib": 1,
            "DisplayName": "Swarmplay System Smoke",
        },
        token=token,
        timeout=120,
    )
    if st != 200 or not isinstance(body, dict) or not body.get("Ready"):
        fail(f"play-bind failed: {st} {body}")
    path = body["Path"]
    item_id = body.get("ItemId") or body.get("itemId")
    if not item_id:
        fail(f"play-bind missing ItemId (O6a): {body}")
    if Path(path).read_bytes() != DATA_FILE.read_bytes():
        fail("bytes mismatch")
    st_item, item = http_json("GET", f"{BASE}/Items/{item_id}", token=token, timeout=30)
    if st_item != 200 or not isinstance(item, dict):
        fail(f"GET Items/{{ItemId}} failed: {st_item} {item}")
    if not item.get("Path"):
        fail(f"library item has no Path: {item}")
    probe = subprocess.run(
        ["/usr/lib/jellyfin-ffmpeg/ffprobe", "-v", "error", "-show_entries", "format=size", "-of", "json", path],
        capture_output=True,
        text=True,
        check=False,
    )
    if probe.returncode != 0:
        fail(f"ffprobe failed: {probe.stderr}")
    print(f"OK system play-bind path={path} ready=1 itemId={item_id}")


if __name__ == "__main__":
    main()
