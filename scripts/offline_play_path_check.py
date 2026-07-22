#!/usr/bin/env python3
"""Offline smoke test for the Ensure -> ready -> Play path."""

import os
import tempfile


MAGIC = b"\x1a\x45\xdf\xa3"
HEAD_BYTES = 256 * 1024
TAIL = b"CUES"
TAIL_OFFSET = 1024 * 1024
WARM_BAND_BYTES = 8 * 1024 * 1024
HEAD_MAGIC_MIN_BYTES = 256 * 1024


def ready_mode(head_bytes_have: int, tail_bytes_have: int, head_magic_ok: bool) -> str:
    if head_bytes_have >= WARM_BAND_BYTES and tail_bytes_have >= WARM_BAND_BYTES:
        return "A"
    if head_bytes_have >= HEAD_MAGIC_MIN_BYTES and head_magic_ok:
        return "B"
    return "none"


def main() -> None:
    descriptor, path = tempfile.mkstemp(prefix="jellyfin-on-demand-play-", suffix=".mkv")
    os.close(descriptor)

    try:
        head = MAGIC + b"\0" * (HEAD_BYTES - len(MAGIC))
        with open(path, "r+b") as file:
            file.write(head)
        initial_size = os.path.getsize(path)

        with open(path, "r+b") as file:
            file.seek(TAIL_OFFSET)
            file.write(TAIL)
        assert os.path.getsize(path) > initial_size

        mode = ready_mode(len(head), len(TAIL), head.startswith(MAGIC))
        assert mode in {"A", "B"}

        with open(path, "rb") as file:
            assert file.read(len(MAGIC)) == MAGIC
    finally:
        os.unlink(path)


if __name__ == "__main__":
    main()
