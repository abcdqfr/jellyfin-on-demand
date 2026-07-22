# ADR-008: Batch episode fanout (0.3)

**Status:** Accepted (implemented 2026-07-22)

**Date:** 2026-07-22

## Context

Season packs and complete-series torrents put many episode files under one
infohash. swarmplay already had server-side `FileIndexPicker` (SxxExx / season
folder ordinals) and native `swarm_list_files`, but the release UI always sent
`FileIndex: 0` and **omitted Episode for batch kind** — so multi-file TV play
fell through to “largest video,” not the episode the user wanted.

strmarr solved the mapping side with `batch.Expand` /
`playresolve.BatchFileIndex` (absolute cour numbers like “3rd Season 49,”
skip NCOP/NCED, dense-band normalize). swarmplay must not import that Go
(`INVARIANTS.md` I8/I10); it ports the **lessons** into C# + a play-time UI.

Library promote / archival was previously commemorated as 0.3; that work
slides to **0.4** so living-room TV packs are usable first.

## Decision

1. **Play-time episode picker (UI):** for TV releases, `releases.js` calls
   `POST /Swarmplay/swarm/list-files`, and if more than one video file is
   present, shows an in-release episode list before `play-bind`. Movies skip
   the picker (largest-video / existing auto-pick).
2. **Explicit file index:** `SwarmEnsureRequest.FileIndexExplicit` — when
   true, `play-bind` keeps the client-chosen `FileIndex` (validated in range)
   instead of overwriting via `FileIndexPicker`.
3. **Hardened `FileIndexPicker`:** SxxExx, `Show - N`, “Nth Season N,”
   absolute-number dense-band normalize (strmarr `normalizeAbsoluteSeasonEpisodes`),
   skip supplementary paths (NCOP/NCED/extras). `TryParseEpisode` feeds the
   list-files DTO for UI labels / preselect.
4. **Not STRM fan-out:** one play still binds one virtual item to
   `btih + file_index`. No O6b/O6c library stub trees in 0.3.

## Consequences

- Cold play of a season pack requires one extra metadata round-trip
  (`list-files`) before warm; acceptable vs wrong-episode play.
- History first-click fix ships in the same commemorative bump (capture
  `focusin`/`pointerdown` on `#searchTextInput`).
- Library promote docs retarget to v0.4.

## References

- `docs/design/file-index-picker.md`
- strmarr `engine/ingest/batch/{fileparse,expand}.go`, `internal/playresolve`
- [ADR-007](007-mkv-aware-extent-gate.md) (extent gate before fanout)
