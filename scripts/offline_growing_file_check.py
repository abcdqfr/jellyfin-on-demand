#!/usr/bin/env python3
"""Model a growing media file with explicit readable byte ranges.

Sparse-file holes may read as zeroes on a local filesystem, but this check
treats only explicitly written ranges as downloaded and readable.  The helper
returns None unless the entire requested range is covered by that map.
"""

import os
import tempfile


MAGIC = b"\x1a\x45\xdf\xa3"
TAIL = b"CUES"
TAIL_OFFSET = 1024 * 1024


def is_covered(offset: int, length: int, written_ranges: set[tuple[int, int]]) -> bool:
    """Return whether [offset, offset + length) is entirely downloaded."""
    end = offset + length
    position = offset
    for start, stop in sorted(written_ranges):
        if stop <= position:
            continue
        if start > position:
            return False
        position = max(position, stop)
        if position >= end:
            return True
    return length == 0


def read(
    path: str, offset: int, length: int, written_ranges: set[tuple[int, int]]
) -> bytes | None:
    """Read a fully downloaded range, otherwise return None."""
    if not is_covered(offset, length, written_ranges):
        return None
    with open(path, "rb") as file:
        file.seek(offset)
        return file.read(length)


def main() -> None:
    descriptor, path = tempfile.mkstemp(prefix="jellyfin-on-demand-growing-", suffix=".mkv")
    os.close(descriptor)
    written_ranges: set[tuple[int, int]] = set()

    try:
        with open(path, "r+b") as file:
            file.write(MAGIC)
        written_ranges.add((0, len(MAGIC)))
        initial_size = os.path.getsize(path)

        with open(path, "r+b") as file:
            file.seek(TAIL_OFFSET)
            file.write(TAIL)
        written_ranges.add((TAIL_OFFSET, TAIL_OFFSET + len(TAIL)))
        grown_size = os.path.getsize(path)

        assert read(path, 0, len(MAGIC), written_ranges) == MAGIC
        assert grown_size > initial_size
        assert read(path, len(MAGIC), 1, written_ranges) is None
    finally:
        os.unlink(path)


if __name__ == "__main__":
    main()
