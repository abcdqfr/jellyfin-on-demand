# Library promote / archival (0.4 tier)

**Status:** Accepted — implemented as **cache-to-library** (2026-07-22),
**Stream corrected to a real `.strm` pointer** in the 0.4.1 hotfix
(2026-07-22, [ADR-010](../adr/010-strm-add-to-library-v0.4.1.md)).

**Commemorative target:** **v0.4.0** (+ v0.4.1 hotfix)

> Formerly scoped as 0.3; 0.3 shipped as in-release episode pick / batch fanout instead.

## Intent

Give the poster/discovery card a third action — **Add to Library** — that
prompts **Stream** (write a permanent `.strm` pointer, strmarr-style — see
[ADR-010](../adr/010-strm-add-to-library-v0.4.1.md)) vs **Cache to library**
(download the whole chosen file straight into a real Jellyfin library
folder) so normal libraries + normal watched-tracking keep working without
jellyfin-on-demand reinventing that logic per item. Neither choice is the plain Play
button's ephemeral, library-free flow — the whole point of this button is to
leave something behind.

## Problem

Today Path points at `JELLYFIN_ON_DEMAND_CACHE_DIR/...` (ephemeral, evicted when idle).
Library items expect a stable folder under a configured media root, scanned
by JF like any other file.

## Resolved decisions (see [ADR-009](../adr/009-cache-to-library-v0.4.md))

1. **Trigger:** third poster-hover button next to Play/Lucky — **Add to
   Library** — opens a 2-choice prompt (Stream / Cache to library), then the
   same ranked release picker (now mode-aware: `play` vs `cache`), and the
   same sortable episode picker for multi-file TV releases.
2. **No hardlink/copy step.** The chosen file is downloaded **straight into
   the destination folder** (`libtorrent` `save_path` = the resolved library
   path) — never through the ephemeral swarm cache dir at all. Simpler than
   the *arr-stack hardlink dance, and there is nothing to reconcile
   afterwards.
3. **Destination folder is auto-resolved, never asked per item:** the server
   picks the Jellyfin library whose `CollectionType` matches the title
   (`movie` → a `movies` library, `tv` → a `tvshows` library) via
   `ILibraryManager.GetVirtualFolders()`. No new Jellyfin on Demand setting, no path
   typed by hand. If no matching library exists, the bind fails loudly with
   a message telling the operator to add one first.
4. **v1 scope: exactly one file per action** — the chosen episode or movie
   file, never a whole batch/season pack in one shot. Caching a second
   episode later from the same torrent is just another Add to Library click.
5. **Allowed anytime; UI blocks/polls until complete.** `cache-bind` returns
   immediately; the client polls `cache-status` (progress/ready) and toasts
   on completion — no "only when 100%" gate on the *button*, but the file is
   not scanned into the library until it actually finishes.
6. **Finalize = one real, targeted Jellyfin library scan** (`Folder.
   ValidateChildren`, recursive, once per completed file) — no manual
   `Movie`/`Episode` item minting, no virtual item. Jellyfin's normal scanner
   does ffprobe/metadata/watched-tracking, exactly like any other library
   file.
7. **Keep seeding after completion** (default, no control surface in v1) —
   there is only ever one copy on disk (no hardlink/copy step to reconcile),
   so continuing to seed costs nothing extra and helps the swarm.

## Stream (0.4.1 correction — see ADR-010)

`stream-bind` writes one `.strm` file into the same auto-resolved library
folder `cache-bind` uses, containing the same authenticated on-demand stream
URL already used for direct-play links (`JE.swarmStreamUrl` →
`GET JellyfinOnDemand/swarm/stream?btih=...&fileIndex=...`, which already does the
full tail/head extent-gate wait on first request). No download, no native
session touched at bind time — just the pointer, plus the same targeted
`Folder.ValidateChildren` scan `cache-bind` triggers on completion. This is
the *only* place in jellyfin-on-demand that writes a `.strm` — Play and Lucky remain
unchanged (real growing-file virtual item, never a placeholder).

## Explicitly not 0.4

- Fake download-client / *arr import.
- Hardlink-vs-copy reconciliation, seed-after-complete controls, whole-batch
  cache-to-library, anime-aware library routing — all deferred until real
  usage shows they're needed.
- Multi-user per-root silos (unless forced by evidence).
- A dedicated service-account API key for `.strm` URLs (today reuses the
  requesting user's own access token via `JE.swarmStreamUrl` — fine for a
  single-user lab deployment, revisit if multi-user token lifetime matters).

## Exit

One living-room flow: **Add to Library → Cache to library** on a poster →
pick a release (and episode, for TV) → downloads straight into a real
library folder → shows up under the normal library view, watched-tracking
included, swarm code no longer involved once it's finished.
