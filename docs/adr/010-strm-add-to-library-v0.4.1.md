# ADR-010: "Add to Library → Stream" writes a real `.strm` pointer (0.4.1 hotfix)

**Status:** Accepted (implemented 2026-07-22)

**Date:** 2026-07-22

## Context

[ADR-009](009-cache-to-library-v0.4.md) shipped **Add to Library** with two
choices, **Stream** and **Cache to library**. "Stream" was implemented as a
bare alias for the plain **Play** button — same ranked/episode picker, same
`play-bind`, same ephemeral virtual item, no library trace at all. That is
*not* what "Add to Library → Stream" means: the whole point of the button is
to leave something behind in the library. Clarified directly (chat,
2026-07-22): **Stream** should behave like `strmarr`/`*arr` STRM setups — a
small permanent pointer file lives in the normal Jellyfin library folder, and
Jellyfin (or ffprobe on next scan) pulls bytes through swarmplay's existing
on-demand stream endpoint only when something actually opens the item.
**Cache to library** is unchanged: a full, traditional download of the real
file to disk.

This directly narrows (not reverses) a long-standing project invariant
repeated across `PRODUCT.md`, `ROADMAP.md`, and several design docs: *"no
STRM"*. That invariant was written about the **core Play/Lucky path**
(`docs/design/virtual-item.md`, `docs/design/play-binding.md`,
`docs/design/magnet-lucky-ux.md`) — Play and Lucky must always bind a real
growing-file virtual item, never a fragile placeholder, because that path is
optimized for "start watching in seconds," not "leave a library trace." That
reasoning is untouched by this ADR. What changes is scoped to one explicit,
opt-in button whose entire purpose is the opposite: "leave a permanent trace,
strmarr-style." Two different jobs, two different mechanisms; both are now
correct for their own job.

## Decision

1. **"Stream" writes a `.strm` file**, not a play-bind. New endpoint `POST
   Swarmplay/swarm/stream-bind`: resolves the destination library folder the
   same way `cache-bind` does (`ResolveLibraryVirtualFolder` by MediaType —
   movies vs tvshows, `Season NN` subfolder for TV), builds a clean filename
   from the title (`{Title}.strm` or `{Title} - SxxExx.strm`), and writes one
   line: the stream URL. No download, no piece prioritization, no native
   session touched at bind time at all.
2. **The client builds the stream URL, not the server.** `JE.swarmStreamUrl`
   already exists (used for direct-play links) — it embeds the *requesting
   user's* access token via `ApiClient.accessToken()`. Reusing it here avoids
   the server minting or extracting a token, at the cost of the pointer being
   tied to that user's token lifetime (acceptable for a single-user lab
   deployment; a dedicated service-account API key is a clean follow-up if
   multi-user ever matters).
3. **Playback is on-demand and unchanged.** The `.strm` target is
   `GET Swarmplay/swarm/stream?btih=...&fileIndex=...` — an endpoint that
   already existed and already calls `EnsureAsync` (full tail/head warm) on
   *first request*, then range-streams the growing file. Nothing new had to
   be built for the read side; only the write side (the pointer itself) was
   missing.
4. **Finalize reuses the exact same targeted-scan helper as cache-to-library**
   (`TriggerLibraryScanAsync`, factored out of `FinalizeCacheAsync`) —
   `Folder.ValidateChildren` on just the resolved library folder, once, right
   after the file is written. No polling needed (unlike cache-to-library):
   writing a few bytes to disk is not a multi-minute operation.
5. **Scope stays exactly where cache-to-library's did:** one file per action,
   auto-resolved destination, no new plugin setting, no per-item prompt.

## Consequences

- `docs/design/library-promote-0.4.md` and `ROADMAP.md`'s "Explicitly
  later"/tagline STRM language are corrected to say what's actually true now:
  Play/Lucky remain non-STRM; `Add to Library → Stream` is STRM, by request,
  scoped to that one button.
- `SwarmEnsureRequest` gained one field, `StreamUrl` (only consumed by
  `stream-bind`) — reused rather than adding a parallel DTO, matching how
  `play-bind`/`cache-bind` already share `SwarmEnsureRequest`.
- A user later clicking normal JF "Play" on a `.strm`-backed library item
  drives `ffprobe`/playback straight at swarmplay's stream endpoint, which
  will do a full extent-gate wait on first touch — same cold-start cost as
  any first play, just triggered by JF's scanner/player instead of our own
  UI.
- Bundled into this same commit is an unrelated regression fix: the
  blazing-ahead readahead window (from the prior, already-shipped fix) was
  sized in raw piece count and could balloon past a gigabyte on
  large-piece-length torrents; it is now bounds in bytes
  (`kReadaheadFloorBytes`). `swarm_status`'s `progress` field now reports
  warm-completion fraction (tail+head[+readahead] pieces on disk) instead of
  raw libtorrent torrent progress, and the client warm overlay polls it into
  a real progress bar instead of an indefinite spinner.

## References

- [ADR-009](009-cache-to-library-v0.4.md) (Add to Library, Cache to library — unchanged)
- `docs/design/library-promote-0.4.md` (corrected)
- `docs/design/virtual-item.md`, `docs/design/play-binding.md`,
  `docs/design/magnet-lucky-ux.md` (Play/Lucky non-STRM invariant — unchanged,
  scoped explicitly away from this ADR)
