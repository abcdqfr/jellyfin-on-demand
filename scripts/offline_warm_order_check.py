#!/usr/bin/env python3
MIB = 1024 * 1024
FLOOR_MIB = 32


def divide_round_up(dividend, divisor):
    return 0 if dividend == 0 else 1 + (dividend - 1) // divisor


def band_bytes(file_length, floor_mib=FLOOR_MIB):
    floor = max(floor_mib, FLOOR_MIB) * MIB
    pct = file_length // 20
    return max(floor, pct)


def plan(file_length, piece_length, tail_mib, head_mib):
    if file_length <= 0 or piece_length <= 0 or tail_mib < 0 or head_mib < 0:
        raise ValueError("all lengths must be valid")

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


# 100 MiB file, 4 MiB pieces → 25 pieces; band=max(32MiB,5%)=32MiB → 8 pieces
assert band_bytes(100 * MIB) == 32 * MIB
assert band_bytes(1000 * MIB) == 50 * MIB  # 5% wins

cases = (
    (100 * MIB, 4 * MIB, 32, 32,
     [("tail", 17, 24), ("head", 0, 7), ("sequential", 8, 16)]),
    (10 * MIB, MIB, 32, 32,
     [("tail", 0, 9)]),  # whole file is warm band
    (3 * MIB, MIB, 0, 0,
     [("tail", 0, 2)]),
)

for file_length, piece_length, tail_mib, head_mib, expected in cases:
    got = plan(file_length, piece_length, tail_mib, head_mib)
    assert got == expected, (file_length, got, expected)

print(f"warm-order: {len(cases)} cases (+ band_bytes)")
