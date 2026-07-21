# Warm-order cases

Ranges are inclusive, zero-based piece indexes. The planner emits non-overlapping
ranges in priority order: `tail`, `head`, then `sequential`.

## Separate warm bands

`fileLength = 100 MiB`, `pieceLength = 4 MiB`, `tailMib = 8`, `headMib = 8`

| Priority | Pieces |
| --- | --- |
| tail | 23–24 |
| head | 0–1 |
| sequential | 2–22 |

## Overlapping warm bands

`fileLength = 10 MiB`, `pieceLength = 1 MiB`, `tailMib = 6`, `headMib = 6`

| Priority | Pieces |
| --- | --- |
| tail | 4–9 |
| head | 0–3 |

The head range excludes pieces already assigned to the tail; there is no remaining
sequential range.

## No warm bands

`fileLength = 3 MiB`, `pieceLength = 1 MiB`, `tailMib = 0`, `headMib = 0`

| Priority | Pieces |
| --- | --- |
| sequential | 0–2 |
