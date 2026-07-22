#!/usr/bin/env python3
MIB = 1024 * 1024
FLOOR_MIB = 8


def divide_round_up(dividend, divisor):
    return 0 if dividend == 0 else 1 + (dividend - 1) // divisor


def band_bytes(file_length, floor_mib=FLOOR_MIB):
    floor = max(floor_mib, FLOOR_MIB) * MIB
    return min(floor, file_length)


def plan(file_length, piece_length, tail_mib, head_mib):
    piece_count = divide_round_up(file_length, piece_length)
    t_floor = FLOOR_MIB if tail_mib == 0 else tail_mib
    h_floor = FLOOR_MIB if head_mib == 0 else head_mib
    tail_pieces = min(piece_count, divide_round_up(band_bytes(file_length, t_floor), piece_length))
    head_pieces = min(piece_count, divide_round_up(band_bytes(file_length, h_floor), piece_length))
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


assert band_bytes(100 * MIB) == 8 * MIB
assert band_bytes(3 * MIB) == 3 * MIB

# 100 MiB, 4 MiB pieces → 25 pcs; 8 MiB band → 2 pieces
cases = (
    (100 * MIB, 4 * MIB, 8, 8,
     [("tail", 23, 24), ("head", 0, 1), ("sequential", 2, 22)]),
    (10 * MIB, MIB, 8, 8,
     [("tail", 2, 9), ("head", 0, 1)]),
    (3 * MIB, MIB, 0, 0,
     [("tail", 0, 2)]),
)

for file_length, piece_length, tail_mib, head_mib, expected in cases:
    got = plan(file_length, piece_length, tail_mib, head_mib)
    assert got == expected, (got, expected)

print(f"warm-order: {len(cases)} cases (+ strmarr 8 MiB floors)")
