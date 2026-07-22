#!/usr/bin/env python3
"""Live native Ensure smoke test using the bundled tiny torrent."""

import ctypes
import sys
import time
from pathlib import Path


class EnsureResult(ctypes.Structure):
    _fields_ = [("path", ctypes.c_char_p), ("ready", ctypes.c_int), ("err", ctypes.c_int)]


class StatusResult(ctypes.Structure):
    _fields_ = [
        ("ready", ctypes.c_int),
        ("err", ctypes.c_int),
        ("has_metadata", ctypes.c_int),
        ("num_peers", ctypes.c_int),
        ("num_seeds", ctypes.c_int),
        ("dht_nodes", ctypes.c_int),
    ]


ROOT = Path(__file__).resolve().parents[1]
library_path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "torrent/native/build/libswarmplay_native.so"
torrent_path = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "third-party/vlc-bittorrent/test/data/sweden.png.torrent"
source = str(torrent_path.resolve()).encode()

library = ctypes.CDLL(str(library_path))
ensure = library.swarm_ensure
ensure.argtypes = [ctypes.c_char_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.POINTER(EnsureResult)]
ensure.restype = ctypes.c_int
status = library.swarm_status
status.argtypes = [ctypes.c_char_p, ctypes.POINTER(StatusResult)]
status.restype = ctypes.c_int

result = EnsureResult()
ensure_status = ensure(source, 0, 0, 0, ctypes.byref(result))
path_out = result.path.decode() if result.path else ""
ready, err = result.ready, result.err

if ensure_status == 0:
    deadline = time.monotonic() + 60
    while not (path_out and Path(path_out).is_file()) and time.monotonic() < deadline:
        time.sleep(1)
        current = StatusResult()
        status(source, ctypes.byref(current))
        ready, err = current.ready, current.err

print(f"PATH_OUT: {path_out or 'null'}")
print(f"READY: {ready}")
print(f"ERR: {err}")
raise SystemExit(0 if path_out and Path(path_out).is_file() else 1)
