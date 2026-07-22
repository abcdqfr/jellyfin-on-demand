# ADR-007: MKV-aware extent gate (ported lessons from strmarr)

**Status:** Accepted (implemented 2026-07-22; native probe + unit tests + `session_stub.cpp` wiring; `scripts/ci_gate.sh` green)

**Date:** 2026-07-22

## Context

0.1.11 closed the first extent-gate bug (`fail_open` on `FileInfo.Length` let
Jellyfin open a file whose bytes were still a sparse libtorrent
pre-allocation — video-only, no audio/subs/seek). The fix was a **blind
fixed floor**: warm tail 8 MiB, then head 8 MiB, then go sequential
(`torrent/native/src/session_stub.cpp`, `kWarmFloorBytes`). That is
`O3c`/`I9` in `INVARIANTS.md` — "tail M + head N MiB" — and it is *still* a
guess, not a structural fact about the file.

**strmarr already fought this exact war** and left forensic proof in
[`../strmarr/docs/issues/tensura-first-play-cold-gate.md`](../../../strmarr/docs/issues/tensura-first-play-cold-gate.md):
a Trix AV1 1080p MKV (337,735,928 bytes) placed its **Cues** element at
byte 335,658,850 — **2.08 MiB from EOF**. strmarr's first-generation probe
started at a 1 MiB tail window, missed the real Cues, hit a **false-positive**
Cues magic (`0x1C 0x53 0xBB 0x6B`) at byte 78 inside the EBML header that
parsed to an *empty* index, treated that as terminal failure, then — because
the old code had no bound — doubled the tail window all the way through the
**entire 322 MiB file** before giving up. Cold play: ~2 minute spinner, then
video with no audio/subs because Jellyfin's ffprobe got a 503 and fell back
to a `-sn`, no-explicit-map transcode.

Two lessons swarmplay has not yet ported:

1. **Fixed byte floors cannot know where Cues live.** They are not a
   percentage of file size, not always in the last N MiB for a given N —
   they are wherever the muxer put them. The only reliable answer is to
   **parse the container** and grow the read window until the real Cues
   element is found, bounded so a cue-less/corrupt file fails cheap instead
   of reading the whole swarm.
2. **The first candidate byte match is not proof.** The Cues element ID is
   4 raw bytes; those bytes can appear by coincidence inside unrelated EBML
   (e.g. the header). A grow-probe must try *all* candidate offsets from
   the end of the window backward and validate each by actually parsing a
   `CuePoint`/`CueTrackPositions` structure, not stop at the first
   byte-string hit.

This is exactly the kind of forced-march strmarr already paid for
(`docs/adr/007-experimental-swarmplay.md`, strmarr side: "only lessons
carried forward from strmarr"). `I8`/`I10` in `INVARIANTS.md` forbid
importing `engine/`/anacrolix code — this ADR ports the **algorithm**, not
the Go, into swarmplay's own C++ native layer.

## Decision

1. **Native MKV/EBML probe** (new `torrent/native/src/mkv_probe.{h,cpp}`,
   no third-party dependency — a few hundred lines of variable-length
   EBML ID/size reading is enough for this scope):
   - `parse_head(bytes, len) -> HeadResult{segment_offset, bytes_read, ok}` —
     walk `Segment(0x18538067)`, descend only into
     `Tracks(0x1654AE6B)`/`Attachments(0x1941A469)`, skip everything else
     (`SeekHead`, `Info`, `Cluster`, `Cues`, ...) by declared element size.
     Confirms the header directory actually parses instead of trusting a
     byte count.
   - `find_cues(bytes, len, tail_start) -> CueResult{found, points_or_count}` —
     scan for the 4-byte Cues prefix **from the end of the buffer backward**,
     and for each candidate try a bounded EBML sub-parse for
     `CuePoint(0xBB)`/`CueTrackPositions(0xB7)` children; skip empty/invalid
     candidates (the Tensura false-positive-at-header case) and keep
     scanning instead of failing on the first hit.

2. **Growing probe, not a blind floor** (replaces
   `compute_warm_bands`'s fixed `tail_mib`/`head_mib` sizing):
   - **Head:** start at 1 MiB, double until `parse_head` succeeds or file
     end is reached. Required head floor = `max(bytes_read, 8 MiB)` —
     matches strmarr's `extentHeadRequired` (never widen further after a
     successful parse; the old "32 MiB for 10-bit" path only burned swarm
     time).
   - **Tail:** start the Cues probe at **2 MiB** (not 1 MiB — that is the
     exact Tensura miss), double up to a **16 MiB cap**
     (`MinCueTailProbe`/`MaxCueTailProbe` in strmarr). If Cues parse inside
     the cap, that window *is* the tail floor. If the cap is reached
     without a valid Cues parse, fall back to a **bounded 16 MiB cue-less
     tail** — never fail open, never read past the cap (the Tensura bug was
     precisely "doubled through the entire file").
   - Reading happens through the existing piece-priority/deadline path
     (`force_piece_deadlines`, `pieces_complete`) — grow the head/tail piece
     bands to match the probe window at each doubling step, wait for those
     specific pieces, then read the on-disk bytes directly for parsing (the
     file is real bytes once `have_piece()` is true for that range; no new
     libtorrent read API needed).

3. **`tail_mib`/`head_mib` become floors, not fixed sizes.** The
   `swarm_ensure` ABI is unchanged (`swarm_ensure(source, file_index,
   tail_mib, head_mib, out)`); those ints are now a **minimum**, and the
   MKV probe can grow tail past the floor (up to 16 MiB) when Cues demand
   it. Non-MKV files (or parse failure before any Cues search starts) keep
   today's fixed-floor behavior unchanged — this only sharpens the MKV
   path.

4. **One probe per (torrent, file_index), cached on `Entry`.** Once
   `warm_phase` reaches sequential with a known cue window (or the
   cue-less fallback), never re-run the parse on subsequent `swarm_ensure`
   calls for the same key — mirrors strmarr's gate-reuse lesson (ADR 009
   there) and matches swarmplay's existing `Entry` cache keyed by
   info-hash + file_index.

5. **No fail-open.** `swarm_ensure` keeps blocking (≤180 s, per 0.1.11)
   until the computed head/tail bands are piece-complete. A cue-less
   fallback still blocks on its (bounded) 16 MiB tail — it does not skip
   the gate, it just gates on a smaller, capped span instead of retrying
   forever.

## Consequences

- New native source file with a minimal EBML reader; no new runtime
  dependency, no ABI break.
- `compute_warm_bands`/`begin_warm`/`advance_warm` need a third state
  (or an inline sub-loop) for "growing cue probe" before locking in the
  tail band size — today's state machine assumes the tail band size is
  known up front.
- CI gate needs a synthetic-MKV fixture: at minimum (a) a small MKV with
  Cues near-but-not-at the naive first-guess window (regression for the
  Tensura miss), and (b) a header byte sequence containing a false-positive
  Cues-ID match (regression for the empty-index bug), and (c) a cue-less
  file (regression for the bounded-fallback path). Prefer a native
  unit/ctest target over a pure-Python simulation like
  `offline_warm_order_check.py`, since the thing under test is now real
  EBML parsing, not just a piece-range arithmetic plan.
- `docs/design/` should get a short design note once implemented, and
  `ROADMAP.md`/`CHANGELOG.md` get the usual close-out entry (0.2.1,
  hotfix tier — this is not a commemorative bump; it hardens the play
  path before Phase 3 batch/episode fanout work).

## References

- [`../../../strmarr/docs/issues/tensura-first-play-cold-gate.md`](../../../strmarr/docs/issues/tensura-first-play-cold-gate.md) — forensic root cause, exact byte offsets, v0.4.3 fix table
- `strmarr/engine/subtitles/engine/{grow.go,cue_probe.go,extent_limits.go}` — growing-probe algorithm (lessons only; not imported per `I8`/`I10`)
- `strmarr/engine/subtitles/engine/mkv/{head.go,cues.go}` — EBML element IDs and parse shape
- `strmarr/docs/adr/007-experimental-swarmplay.md` — why swarmplay exists as a clean-room reimplementation
- `INVARIANTS.md` I9/O3c — current fixed-floor warm-lite contract this ADR sharpens
