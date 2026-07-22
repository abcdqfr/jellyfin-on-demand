# ADR-009: Cache-to-library (0.4)

**Status:** Accepted (implemented 2026-07-22)

**Date:** 2026-07-22

## Context

swarmplay's swarm-served playback path (`ensure` → growing file in
`SWARMPLAY_CACHE_DIR` → virtual `Movie` item) is deliberately ephemeral: it
optimizes for "start watching now," not "keep this." Users who want a title
to live permanently in their normal Jellyfin library (offline playback, real
watched-tracking, survives torrent idling out) had no path except manually
re-downloading through a different tool.

[docs/design/library-promote-0.4.md](../design/library-promote-0.4.md) had
been sketched with four open questions (hardlink vs copy, single-episode vs
whole-batch, promote gate before 100%, where the destination folder comes
from). Rather than guess and risk a rebuild, these were asked directly
(chat, 2026-07-22) before implementation.

## Decision

1. **Third poster-hover button, "Add to Library"** (next to Play/Lucky), not
   a history-row or player-OSD action. Clicking it prompts **Stream** vs
   **Cache to library**, then reuses the existing ranked release picker
   (now mode-aware: `play` | `cache`) and the existing sortable episode
   picker for multi-file TV releases — no new picker UI built from scratch.
2. **No hardlink/copy step.** `swarm_cache_ensure()` (new native entry
   point) adds the torrent with `save_path` set directly to the resolved
   library folder and downloads only the chosen file (all other files in the
   torrent set to `dont_download`). There is never a second ephemeral copy
   to reconcile — libtorrent writes the final bytes exactly once, in place.
3. **Destination auto-resolved server-side, never asked per item:**
   `SwarmController.ResolveLibraryVirtualFolder` picks the Jellyfin library
   whose `CollectionType` is `movies` (movie) or `tvshows` (TV) via
   `ILibraryManager.GetVirtualFolders()`. Deterministic first-match (Name
   ascending) if more than one library shares that type. No new Swarmplay
   plugin setting.
4. **v1 caches exactly one file** (the chosen episode/movie), matching the
   existing per-file play model — never a whole batch in one action.
5. **`cache-bind` returns immediately; client polls `cache-status`.** No
   "must already be 100%" gate on the button — the action can be started any
   time, and the UI just toasts progress until the native side reports the
   whole target file's pieces are on disk (`swarm_status_result.progress`,
   a new append-only ABI field also now populated by plain `swarm_status`).
6. **Finalize = one real, targeted library scan**, not a hand-minted virtual
   item: `SwarmController.FinalizeCacheAsync` calls `Folder.ValidateChildren`
   (recursive) on the resolved library folder exactly once per completed
   file (`ConcurrentDictionary` guard). Jellyfin's own scanner does
   metadata/ffprobe/watched-tracking from there — this is the whole point of
   cache-to-library: stop reinventing that logic.
7. **Keep seeding after completion**, no stop-seeding control in v1. Since
   there's only ever one copy on disk, seeding costs nothing extra.

## Consequences

- New native ABI surface: `swarm_cache_ensure`, `swarm_cache_status`, and an
  append-only `progress` field on `swarm_status_result`. Cache-mode torrents
  are tracked under their own `Session::torrents` map key
  (`<key>-cache-<file_index>`) so a concurrent `swarm_ensure()` stream of the
  same torrent is never touched.
- `SwarmController.ResolveFileIndexAsync` extracted out of `PlayBind` so
  `CacheBind` reuses the exact same strmarr-style file-index resolution
  (no duplicated episode-matching logic).
- No control yet for "stop seeding this cached file" or "cache the whole
  season pack" — explicitly deferred (see design doc "Explicitly not 0.4").
- Progress polling is client-side only (no server-side job persisted across
  page reloads) — acceptable for v1; a stalled/very slow download just stops
  updating the toast if the user navigates away.

## References

- `docs/design/library-promote-0.4.md`
- [ADR-007](007-mkv-aware-extent-gate.md) (the extent-gate this deliberately
  does *not* use — cache-to-library withholds "ready" until the whole file is
  on disk, not just a warm window, so there is nothing to gate)
- [ADR-008](008-batch-episode-fanout-v0.3.md) (episode picker this reuses)
