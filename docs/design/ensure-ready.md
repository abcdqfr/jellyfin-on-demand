# Ensure / Status / Stop + `ready` (draft)

**Status:** draft for offline implementation — refine when first play evidence exists.

**Surface:** in-process (O7a). Same shapes later map to O7b HTTP.

## Calls

### `Ensure(req) → { path, ready, btih, file_index, warm }`

```text
req:
  btih: string            # infohash (hex or magnet xt)
  file_index: int         # multi-file; 0 default
  warm:
    tail_mib: number      # default ~5% of file or floor 32 MiB (I9 thesis)
    head_mib: number
    order: "tail_then_head"
  magnet?: string         # optional; if set, parse btih from it
```

- Adds torrent to shared `lt::session` (vlc-bt `Session::get()` shape).
- Sets sequential download for `file_index`.
- Raises piece priority: **tail band → head band → sequential**.
- Returns on-disk path of the chosen file (incomplete OK).
- Does **not** block forever on full warm; see `ready`.

### `Status(btih) → { path, ready, peers, progress, phase }`

`phase`: `resolving` | `warming_tail` | `warming_head` | `sequential` | `idle` | `error`

### `Stop(btih, opts?)`

Optional: leave seeding (default) vs remove. Product default: leave seeding until idle policy (strmarr lore).

## `ready` predicate (TBD — draft)

Play may start when **any** of:

| Mode | Predicate | Notes |
|------|-----------|--------|
| **A — warm complete** | Tail M + head N bytes present for file | Strongest for MKV cues |
| **B — head magic** | First N KiB readable + looks like media | Fail-open path if warm slow |
| **C — timeout fail-open** | Warm deadline exceeded + head has *some* data | I9 fail-open; log warning |

**Draft defaults (tune with evidence):**

- Floors: `max(32 MiB, 5% of file)` for each of tail and head (operator hat bet).
- Warm deadline: 30–90s (config); then mode C if head has ≥ 256 KiB.
- `ready: false` ⇒ JF should not start ffmpeg yet (plugin waits or shows spinner).

Unit tests (when Wi‑Fi): synthetic piece map asserting priority order; no network required for order tests.

## Non-goals here

- HTTP media bytes
- Whole-file high priority
- Seerr request semantics
