#!/usr/bin/env python3
"""Minimal ABI smoke test for libjellyfin_on_demand_native.so."""

import ctypes
import sys
from pathlib import Path


class EnsureResult(ctypes.Structure):
    _fields_ = [
        ("path", ctypes.c_char_p),
        ("ready", ctypes.c_int),
        ("err", ctypes.c_int),
    ]


library_path = Path(
    sys.argv[1] if len(sys.argv) > 1 else "torrent/native/build/libjellyfin_on_demand_native.so"
)
library = ctypes.CDLL(str(library_path))
ensure = library.swarm_ensure
ensure.argtypes = [ctypes.c_char_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.POINTER(EnsureResult)]
ensure.restype = ctypes.c_int

result = EnsureResult()
status = ensure(b"not-a-valid-magnet", 0, 0, 0, ctypes.byref(result))
if status == 0 or result.err == 0:
    raise SystemExit(f"expected invalid-input error, got status={status} err={result.err}")

print(f"ABI OK: swarm_ensure rejected invalid magnet (status={status}, err={result.err})")
