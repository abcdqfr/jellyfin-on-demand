#!/usr/bin/env python3
"""User-scoped Jellyfin + local seeder → POST /Swarmplay/swarm/ensure → ready."""

from __future__ import annotations

import json
import os
import shutil
import signal
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
NATIVE_DIR = ROOT / "torrent/native/build"
PLUGIN_DLL = (
    ROOT
    / "plugin/Jellyfin.Plugin.Swarmplay/Jellyfin.Plugin.Swarmplay/bin/Debug/net9.0/Jellyfin.Plugin.Swarmplay.dll"
)
CACHE_ROOT = Path(os.environ.get("SWARMPLAY_CACHE_DIR", "/home/brandon/cache/swarmplay"))
JF_ROOT = CACHE_ROOT / ".jf-local-smoke"
INFOHASH = "fce002e43ed1159f4612982ce8fcdb9d30e48f1e"
EXPECTED_SIZE = 636
PORT = 18096
BASE = f"http://127.0.0.1:{PORT}"
USER = "swarm"
PASS = "swarm"


def fail(msg: str) -> None:
    print(msg, file=sys.stderr)
    raise SystemExit(1)


def http_json(method: str, url: str, body=None, token: str | None = None, timeout: float = 30.0):
    data = None if body is None else json.dumps(body).encode()
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Emby-Authorization": 'MediaBrowser Client="swarmplay-smoke", Device="smoke", DeviceId="swarmplay-smoke", Version="1.0.0"',
    }
    if token:
        headers["X-Emby-Token"] = token
        headers["X-MediaBrowser-Token"] = token
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            if not raw:
                return resp.status, None
            return resp.status, json.loads(raw.decode())
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            parsed = json.loads(raw.decode()) if raw else None
        except Exception:
            parsed = raw.decode(errors="replace") if raw else None
        return e.code, parsed


def wait_ready(timeout: float = 120.0) -> str:
    """Wait past migrations, complete wizard if needed, then auth."""
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        try:
            st, body = http_json("GET", BASE + "/System/Info/Public", timeout=5)
            # 503 HTML = still migrating; 200 JSON = API up.
            if st == 200 and isinstance(body, dict):
                token = complete_wizard_if_needed()
                if token:
                    return token
            last = (st, type(body).__name__)
        except SystemExit as exc:
            last = exc
        except Exception as exc:
            last = exc
        time.sleep(1.0)
    fail(f"JF auth not ready: {last}")


def ensure_plugin() -> None:
    if not PLUGIN_DLL.is_file():
        fail(f"missing plugin dll: {PLUGIN_DLL}")
    if not (NATIVE_DIR / "libswarmplay_native.so").is_file():
        fail("missing libswarmplay_native.so")
    plug = JF_ROOT / "data/plugins/Jellyfin.Plugin.Swarmplay"
    plug.mkdir(parents=True, exist_ok=True)
    shutil.copy2(PLUGIN_DLL, plug / "Jellyfin.Plugin.Swarmplay.dll")
    meta = {
        "guid": "f69e946a-4b3c-4e9a-8f0a-8d7c1b2c4d9b",
        "name": "Jellyfin Enhanced",
        "description": "Swarmplay",
        "overview": "Swarmplay",
        "owner": "swarmplay",
        "category": "General",
        "version": "11.12.0.0",
        "targetAbi": "10.11.0.0",
        "timestamp": "2026-07-21T00:00:00.0000000Z",
        "autoUpdate": False,
    }
    (plug / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    cfg = JF_ROOT / "config"
    cfg.mkdir(parents=True, exist_ok=True)
    (cfg / "network.xml").write_text(
        "<NetworkConfiguration>"
        "<EnableHttps>false</EnableHttps>"
        "<EnableRemoteAccess>false</EnableRemoteAccess>"
        f"<InternalHttpPort>{PORT}</InternalHttpPort>"
        "<InternalHttpsPort>18920</InternalHttpsPort>"
        f"<PublicHttpPort>{PORT}</PublicHttpPort>"
        "<PublicHttpsPort>18920</PublicHttpsPort>"
        "<AutoDiscovery>false</AutoDiscovery>"
        "<EnableUPnP>false</EnableUPnP>"
        "<EnableIPv4>true</EnableIPv4>"
        "<EnableIPv6>false</EnableIPv6>"
        "</NetworkConfiguration>"
    )


def start_jellyfin() -> subprocess.Popen:
    env = os.environ.copy()
    env["LD_LIBRARY_PATH"] = f"{NATIVE_DIR}:{env.get('LD_LIBRARY_PATH', '')}"
    env["SWARMPLAY_CACHE_DIR"] = str(CACHE_ROOT)
    JF_ROOT.mkdir(parents=True, exist_ok=True)
    for sub in ("data", "config", "cache", "logs"):
        (JF_ROOT / sub).mkdir(exist_ok=True)
    log = open(JF_ROOT / "jellyfin-stdout.log", "ab", buffering=0)
    cmd = [
        "/usr/bin/jellyfin",
        "--datadir", str(JF_ROOT / "data"),
        "--configdir", str(JF_ROOT / "config"),
        "--cachedir", str(JF_ROOT / "cache"),
        "--logdir", str(JF_ROOT / "logs"),
        "--ffmpeg", "/usr/lib/jellyfin-ffmpeg/ffmpeg",
        "--webdir", "/usr/share/jellyfin/web",
    ]
    return subprocess.Popen(cmd, env=env, stdout=log, stderr=subprocess.STDOUT)


def complete_wizard_if_needed() -> str:
    # Auth first if user exists
    st, body = http_json(
        "POST",
        BASE + "/Users/authenticatebyname",
        {"Username": USER, "Pw": PASS},
    )
    if st == 200 and isinstance(body, dict) and body.get("AccessToken"):
        return body["AccessToken"]
    if st == 503:
        return ""  # still starting — caller retries

    # Startup wizard (ignore transient 503)
    for path, payload in (
        ("/Startup/Configuration", {
            "UICulture": "en-US",
            "MetadataCountryCode": "US",
            "PreferredAudioLanguage": "eng",
            "PreferredSubtitleLanguage": "eng",
        }),
        ("/Startup/User", {"Name": USER, "Password": PASS}),
        ("/Startup/Complete", {}),
    ):
        st, body = http_json("POST", BASE + path, payload)
        if st == 503:
            return ""
        if path.endswith("/User") and st not in (200, 204, 400):
            pass

    st, body = http_json(
        "POST",
        BASE + "/Users/authenticatebyname",
        {"Username": USER, "Pw": PASS},
    )
    if st == 200 and isinstance(body, dict) and body.get("AccessToken"):
        return body["AccessToken"]
    if st == 503:
        return ""
    fail(f"auth failed after wizard: {st} {body}")
    return ""


def start_seeder():
    ti = lt.torrent_info(str(TORRENT_PATH))
    ses = lt.session({"listen_interfaces": "127.0.0.1:0"})
    h = ses.add_torrent({"ti": ti, "save_path": str(DATA_DIR)})
    deadline = time.monotonic() + 10
    while not h.status().is_seeding and time.monotonic() < deadline:
        time.sleep(0.1)
    if not h.status().is_seeding:
        fail("seeder not ready")
    port = ses.listen_port()
    if not port:
        fail("seeder port 0")
    magnet = f"magnet:?xt=urn:btih:{INFOHASH}&x.pe={quote(f'127.0.0.1:{port}')}"
    return ses, h, magnet


def main() -> None:
    if DATA_FILE.stat().st_size != EXPECTED_SIZE:
        fail("bad fixture size")
    download = CACHE_ROOT / INFOHASH
    shutil.rmtree(download, ignore_errors=True)
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    ensure_plugin()

    # Kill any prior user-scoped JF on our port
    subprocess.run(["fuser", "-k", f"{PORT}/tcp"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.5)

    proc = start_jellyfin()
    try:
        token = wait_ready(timeout=90)
        _ses, _h, magnet = start_seeder()

        st, body = http_json(
            "POST",
            BASE + "/Swarmplay/swarm/play-bind",
            {
                "Magnet": magnet,
                "Btih": INFOHASH,
                "FileIndex": 0,
                "TailMib": 1,
                "HeadMib": 1,
            },
            token=token,
            timeout=120,
        )
        if st != 200 or not isinstance(body, dict):
            fail(f"play-bind failed: {st} {body}")
        if not body.get("Ready"):
            fail(f"play-bind not ready: {body}")
        path = body.get("Path")
        if not path:
            fail(f"play-bind no path: {body}")
        if body.get("Protocol") != "File":
            fail(f"unexpected protocol: {body}")
        if body.get("VirtualItemKey") != f"swarm:{INFOHASH}:0":
            fail(f"bad virtual key: {body}")

        if not Path(path).is_file() or Path(path).stat().st_size != EXPECTED_SIZE:
            fail(f"bad download: {path}")
        if Path(path).read_bytes() != DATA_FILE.read_bytes():
            fail("bytes mismatch")

        ffprobe = "/usr/lib/jellyfin-ffmpeg/ffprobe"
        if not Path(ffprobe).is_file():
            fail(f"missing ffprobe: {ffprobe}")
        probe = subprocess.run(
            [ffprobe, "-v", "error", "-show_entries", "format=format_name,size", "-of", "json", path],
            check=False,
            capture_output=True,
            text=True,
        )
        if probe.returncode != 0:
            fail(f"ffprobe failed: {probe.stderr}")
        print(f"OK path={path} size={EXPECTED_SIZE} ready=1 play-bind=1 ffprobe=0")
    finally:
        proc.send_signal(signal.SIGTERM)
        try:
            proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    main()
