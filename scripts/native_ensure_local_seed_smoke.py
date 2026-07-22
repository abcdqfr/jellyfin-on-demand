#!/usr/bin/env python3
"""Smoke-test swarm_ensure against a local python-libtorrent seeder."""

import ctypes
import os
import shutil
import sys
import time
from pathlib import Path
from urllib.parse import quote

import libtorrent as lt


class EnsureResult(ctypes.Structure):
    _fields_ = [("path", ctypes.c_char_p), ("ready", ctypes.c_int), ("err", ctypes.c_int)]


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "third-party/vlc-bittorrent/test/data"
TORRENT_PATH = DATA_DIR / "sweden.png.torrent"
DATA_FILE = DATA_DIR / "sweden.png"
LIBRARY_PATH = ROOT / "torrent/native/build/libswarmplay_native.so"
INFOHASH = "fce002e43ed1159f4612982ce8fcdb9d30e48f1e"
CACHE_ROOT = Path(os.environ.get("SWARMPLAY_CACHE_DIR", "/home/brandon/cache/swarmplay"))
DOWNLOAD_DIR = CACHE_ROOT / INFOHASH
EXPECTED_SIZE = 636


def fail(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(1)


if not TORRENT_PATH.is_file() or not DATA_FILE.is_file():
    fail(f"missing test torrent or payload in {DATA_DIR}")
if DATA_FILE.stat().st_size != EXPECTED_SIZE:
    fail(f"unexpected seed size: {DATA_FILE.stat().st_size}")
if not LIBRARY_PATH.is_file():
    fail(f"missing native library: {LIBRARY_PATH}")

shutil.rmtree(DOWNLOAD_DIR, ignore_errors=True)

torrent_info = lt.torrent_info(str(TORRENT_PATH))
if str(torrent_info.info_hashes().v1) != INFOHASH:
    fail("unexpected torrent infohash")

seeder = lt.session({"listen_interfaces": "127.0.0.1:0"})
seed = seeder.add_torrent({"ti": torrent_info, "save_path": str(DATA_DIR)})
deadline = time.monotonic() + 10
while not seed.status().is_seeding and time.monotonic() < deadline:
    time.sleep(0.1)
if not seed.status().is_seeding:
    fail("local seeder did not verify")

port = seeder.listen_port()
if not port:
    fail("local seeder did not bind a port")
magnet = f"magnet:?xt=urn:btih:{INFOHASH}&x.pe={quote(f'127.0.0.1:{port}')}"

library = ctypes.CDLL(str(LIBRARY_PATH))
ensure = library.swarm_ensure
ensure.argtypes = [ctypes.c_char_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.POINTER(EnsureResult)]
ensure.restype = ctypes.c_int

result = EnsureResult()
status = ensure(magnet.encode(), 0, 0, 0, ctypes.byref(result))
if status != 0:
    fail(f"swarm_ensure failed: status={status} err={result.err}")

destination = DOWNLOAD_DIR / "sweden.png"
deadline = time.monotonic() + 90
while time.monotonic() < deadline:
    if destination.is_file() and destination.stat().st_size == EXPECTED_SIZE:
        print(destination)
        raise SystemExit(0)
    time.sleep(0.25)

fail(f"download incomplete: path={destination} size={destination.stat().st_size if destination.exists() else 0}")
