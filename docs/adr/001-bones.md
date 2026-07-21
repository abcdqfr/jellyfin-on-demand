# ADR-001 (swarmplay): Bones architecture

**Status:** Accepted — options locked per 2026-07-20 operator picks (O6/O7 in ADR-002)

**Date:** 2026-07-20

## Context

strmarr proved *arr → STRM → anacrolix HTTP → Jellyfin. The desired product is
the opposite spine: **Jellyfin pane + btih swarm + sequential bytes**, without
STRM, strmarr media HTTP, anacrolix, or *arr.

This tree started as `strmarr/experimental/swarmplay/` and now lives as a
**sibling directory** (`swarmplay/` next to `strmarr/`).

## Decision

1. Scaffold at this repo root; spinoff-ready; outside strmarr contracts.
2. Invariants and options: [`INVARIANTS.md`](../../INVARIANTS.md).
3. **Locked picks:**

   | Option | Pick |
   |--------|------|
   | O1 | libtorrent-rasterbar (O1a) |
   | O2 | growing file path (O2a) |
   | O3 | head+tail warm lite, order **tail → head → sequential** (O3c + I9) |
   | O4 | fork JE → Swarmplay (O4b) — see [ADR-003](003-fork-je.md) |
   | O5 | paste magnet **and** Torznab; first indexers **Nyaa + TPB**; ranked list in JF so best match is first (I11) |
   | O6 | virtual items (O6a) — see [ADR-002](002-o6-o7.md) |
   | O7 | in-JF libtorrent for MVP (O7a, follow vlc-bt); sidecar O7b on roadmap — see [ADR-002](002-o6-o7.md) |

4. No code imports from any *arr/STRM sister `internal/` or `engine/`. Lessons only
   (including cache prefs and typical BT seeding options). Re-derive from LESSONS;
   for O7b examples when that roadmap item starts.

## Consequences

- Warm implementation must request **tail pieces before head pieces**, then
  switch to sequential — not head-then-tail. Operator thesis: last ~5% then
  first ~5% yields enough extents for probe/play, then grow sequential.
- Discovery UX is a short ranked release list inside Jellyfin, not a raw
  Torznab dump and not *arr Interactive.
- Historical sister ADR-007 (external) once pointed at this tree; this repo is now standalone.
