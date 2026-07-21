#!/usr/bin/env python3
MIB = 1024 * 1024
LONG_MAX = (1 << 63) - 1


def divide_round_up(dividend, divisor):
    return 0 if dividend == 0 else 1 + (dividend - 1) // divisor


def to_bytes(mib):
    return LONG_MAX if mib > LONG_MAX // MIB else mib * MIB


def plan(file_length, piece_length, tail_mib, head_mib):
    if file_length <= 0 or piece_length <= 0 or tail_mib < 0 or head_mib < 0:
        raise ValueError("all lengths must be valid")

    piece_count = divide_round_up(file_length, piece_length)
    tail_pieces = min(piece_count, divide_round_up(to_bytes(tail_mib), piece_length))
    head_pieces = min(piece_count, divide_round_up(to_bytes(head_mib), piece_length))
    tail_start = piece_count - tail_pieces
    head_end = min(head_pieces - 1, tail_start - 1)
    ranges = []
    for priority, first, last in (
        ("tail", tail_start, piece_count - 1),
        ("head", 0, head_end),
        ("sequential", head_end + 1, tail_start - 1),
    ):
        if first <= last:
            ranges.append((priority, first, last))
    return ranges


cases = (
    (100 * MIB, 4 * MIB, 8, 8,
     [("tail", 23, 24), ("head", 0, 1), ("sequential", 2, 22)]),
    (10 * MIB, MIB, 6, 6,
     [("tail", 4, 9), ("head", 0, 3)]),
    (3 * MIB, MIB, 0, 0,
     [("sequential", 0, 2)]),
)

for file_length, piece_length, tail_mib, head_mib, expected in cases:
    assert plan(file_length, piece_length, tail_mib, head_mib) == expected

print(f"warm-order: {len(cases)} cases")
