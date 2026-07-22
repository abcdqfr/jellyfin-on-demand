# Changelog

## Unreleased

## 0.5.1 — 2026-07-22 (hotfix / RC)

### Fixed
- Discover no longer stays stacked over Jellyfin’s player / item-details after Play or Lucky (hide before warm/play; do not restore the previous page on top of video).
- Playback from Discover tries `playbackManager.play({ items })` and auto-clicks the detail Play button so the extra “press Play in the normal UI” step is avoided when possible.
- Search landing “Browse Discover” link hidden (was broken); use the sidebar Discover entry instead.

## 0.5.0 — 2026-07-22

### Added
- **Discover pane:** sidebar entry next to Enhanced Panel / Bookmarks that mirrors Seerr Discover's default slider order — Trending, Popular Movies, Movie Genres, Upcoming Movies, Popular Series, Series Genres, Upcoming Series. Cards reuse the rolled-in jellyseerr poster chrome, so Play / Lucky / Library behave identically to search. TMDB-backed when Seerr is off (`GET /Swarmplay/jellyseerr/discover/{trending,movies,tv}` + genreslider). Search landing page (empty query) also gets a "Browse Discover" link. Genre color tones / slider titles from seerr Discover (MIT — steal-log in [`ATTRIBUTION.md`](ATTRIBUTION.md)).

### Changed
- **Attribution:** [`ATTRIBUTION.md`](ATTRIBUTION.md) now explicitly documents that upstream Jellyfin Enhanced's Seerr/Jellyseerr *client chrome* is rolled into this Swarmplay fork (GPL-3.0 JE derivative) and retargeted — Seerr/Jellyseerr remains reference-only, not a runtime ([ADR-004](docs/adr/004-one-product-no-seerr-fork.md)).

### Fixed
- Discover click no longer pushes `#/discover` into Jellyfin's router (404).
- Discover empty pane: container query used `.sections swarmplay-discover` (descendant) instead of `.sections.swarmplay-discover`.

## 0.4.1 — 2026-07-22 (hotfix)

### Fixed
- **"Add to Library → Stream" now writes a real `.strm` pointer** instead of silently aliasing the plain Play button (no library trace at all, which defeats the point of "Add to Library"). New `POST /Swarmplay/swarm/stream-bind` writes one line — the same authenticated on-demand stream URL already used for direct-play links — into a `.strm` file inside the same auto-resolved library folder `cache-bind` uses, then triggers the same targeted `Folder.ValidateChildren` scan. Play and Lucky are unchanged: still always bind a real growing-file virtual item, never a placeholder ([ADR-010](docs/adr/010-strm-add-to-library-v0.4.1.md)).
- **Blazing-ahead readahead-window regression:** the post-tail+head readahead window (added to stop Direct Play racing into sparse holes) was sized in raw piece count (`+48` pieces) — on torrents with a large libtorrent-auto-selected piece length this ballooned into hundreds of MiB to a full gigabyte before Play would unblock, far slower than before that fix landed. Bounded in bytes instead (`kReadaheadFloorBytes`, 24 MiB), independent of piece length.
- **Warm progress bar (was a dumb spinner):** `swarm_status`'s `progress` field now reports the fraction of tail+head[+readahead] pieces actually on disk (`warm_progress`) instead of raw libtorrent torrent progress, whose denominator silently changes size mid-warm and made any progress UI driven by it jump around or under-report. The client warm overlay (play-bind, cache-neighbor nav, history replay) now polls `/status` and renders a real percentage + peer count wherever the btih is known up front, falling back to an indeterminate sweep only for the one path that resolves btih server-side (`/lucky` for movies).

## 0.4.0 — 2026-07-22

### Fixed
- **History row actions:** play (last btih) + search-again icons; no more jellyseerrMoreInfo "Failed to load media information" on row click.
- **Episode pick felt silent:** persistent warm overlay/spinner for the full play-bind wait; batch prev/next bar stages neighbor files through ensure+warm.
- **Blazing-ahead seeks:** gate Play until contiguous readahead window is on disk, then slide piece deadlines from the first missing piece on status polls (Direct Play + Cues into sparse holes).
- **Batch prev/next:** dropped the floating bar entirely — hijack Jellyfin's own `.btnPreviousTrack`/`.btnNextTrack` OSD buttons (capture-phase click override), so batch navigation lives inside native player chrome and hides/fades with it automatically.
- **Episode picker:** replaced the plain `<ul>` with a sortable `<table>` (click any column — #, S, E, File, Size — to sort asc/desc).
- **Lucky on TV:** no longer silently binds S1E1 of the rank-#1 release — `swarmPlayLucky` reuses the same rank-top pick (search results are already RankReleases-ordered) but routes through `playRelease`, so the episode-picker table still opens for multi-file series releases.
- **History "▶ play last" on TV:** also reopens the same episode picker (via `listFiles`, exported `JE.swarmReleases.showEpisodePicker`) instead of silently re-binding whatever file index was played last time.

### Added
- **Cache-to-library (0.4):** new "Add to Library" poster button next to Play/Lucky — prompts Stream vs Cache to library, then reuses the ranked release picker + sortable episode picker. Cache to library downloads the chosen file straight into a real, auto-resolved Jellyfin library folder (movies/tvshows matched by MediaType — no hardlink/copy step, no new plugin setting) and triggers one targeted `Folder.ValidateChildren` scan on completion, so it becomes a normal library item with normal watched-tracking ([ADR-009](docs/adr/009-cache-to-library-v0.4.md)).
- New native ABI: `swarm_cache_ensure`/`swarm_cache_status`, plus an append-only `progress` field on `swarm_status_result`.
- New endpoints: `POST /Swarmplay/swarm/cache-bind`, `GET /Swarmplay/swarm/cache-status`.

## 0.3.0 — 2026-07-22

### Added
- **Batch episode fanout:** TV multi-file releases open an in-release episode picker (`POST /list-files` → pick file → `play-bind` with `FileIndexExplicit`). Ports strmarr BatchFileIndex lessons into `FileIndexPicker` (absolute cour numbers, NCOP skip, dense-band normalize) ([ADR-008](docs/adr/008-batch-episode-fanout-v0.3.md)).

### Fixed
- **History first-click:** dropdown opens on the first focus/click via capture `focusin`/`pointerdown` (no longer requires typing or a second click).
- **Head gate waited on Tracks only:** `parse_head` clears ready only after Attachments (fonts) are fully in-buffer or Cluster ends the head — strmarr `headAttachmentsReady` / `BytesRead`.

### Changed
- Library promote / archival commemorative target moved to **0.4** (was 0.3).

## 0.2.2 — 2026-07-22

### Fixed
- **Virtual-item ffprobe skip (root cause of silent/sub-less playback):** `BindVirtualMovieAsync` minted the bound `Movie` with `IsVirtualItem = true`. Jellyfin's `ProbeProvider.FetchVideoInfo` unconditionally returns early for any item flagged virtual — no ffprobe, ever, regardless of `MetadataRefreshMode`. `MediaStreams` stayed `[]` permanently, so PlaybackInfo/ffmpeg fell back to no explicit stream maps even after the 0.2.1 extent gate warmed real head/tail bytes. This is why "no improvement" was reported after ADR-007 shipped — the gate was fine, the item metadata was the actual break. Fixed: bound items are real playable files, so `IsVirtualItem = false`; added an explicit post-gate `RefreshMetadata(FullRefresh)` when `MediaStreams` is still empty (skipped on replays that already have stream data). Verified live against a real torrent (*This Is England*, 2006): `MediaStreams` went from `[]` to 1 video + 2 audio (AAC 5.1 / stereo) + 1 PGSSUB subtitle stream.

### Changed
- **Search history UX:** replaced the omnipresent floating **History** button + modal with a browser-address-bar-style dropdown anchored to the native Jellyfin search field (`#searchTextInput`) — opens on focus/typing, closes on blur/Escape/outside-click, per-entry remove (−) button, single "Clear history" action. Nothing persists on screen when the search field isn't focused.

## 0.2.1 — 2026-07-22

### Fixed
- **MKV-aware extent gate:** replaced the blind fixed 8 MiB tail + 8 MiB head floor with a growing, structurally-verified native EBML probe (`torrent/native/src/mkv_probe.{h,cpp}`) — head grows 1 MiB → parsed `Tracks` size (floor 8 MiB), tail grows 2 MiB → 16 MiB hunting a real `Cues` element (multi-candidate backward search, bounded cue-less fallback if none parses); `tail_mib`/`head_mib` are now floors, not fixed sizes; probe result cached per (torrent, file_index), no re-parse once warm. Ports forensics from strmarr's Tensura cold-gate incident (real Cues past a naive small tail window, false-positive Cues-ID match inside the EBML header) ([ADR-007](docs/adr/007-mkv-aware-extent-gate.md))

## 0.2.0 — 2026-07-22

### Added
- **Search history:** per-user `swarm-history.json` (pin / delete / clear / LRU cap 100), discovery floating **History** panel, auto-record on Torznab picker + play-bind ready ([ADR-006](docs/adr/006-search-history-v0.2.md))

## 0.1.11 — 2026-07-22

### Fixed
- **Extent gate (strmarr PreparePlay):** `swarm_ensure` blocks until 8 MiB tail then 8 MiB head are on disk (piece deadlines); no 5%/32 MiB tax; withhold PlayNow until `extent gate OK`
- **Play picker empty:** TV defaults to Batch/season; if episode filters wipe the list, show ranked hits anyway; relevance gate 0.5; 240 s client timeout for warm

## 0.1.10 — 2026-07-22

### Fixed
- **To Love-Ru / extent gate:** removed `fail_open` on `FileInfo.Length` — libtorrent sparse prealloc made play start ~11s into tail-only warm (no head, rolling buffer, no audio/subs). Play waits for native `warm_complete` (tail then head) only.

## 0.1.9 — 2026-07-22

### Added
- Discovery **Lucky** button next to Play: Torznab → rank #1 → mature warm → real Jellyfin player (skips release picker)

### Fixed
- Extent warming now mature: band `max(32 MiB, 5% of file)`, **full tail before head**, then sequential — ready only after both bands land

## 0.1.8 — 2026-07-21

### Added
- O6a virtual **Movie** bind: play-bind creates/updates a real Jellyfin `ItemId` whose `Path` is the growing file, then client **PlayNow** to Jellyfin Desktop (normal OSD + transcoder). No DIY player.

### Fixed
- Cold Torznab magnets timed out at metadata (−3): C# now passes sanitized `xt`+`tr=` magnets (drops `dn=`); native bootstraps DHT like vlc-bt, unlocks during metadata wait, persists `SWARMPLAY_CACHE_DIR/metainfo/<btih>.torrent`, and surfaces peers/trackers/`has_metadata` for dead-pin failures

## 0.1.7 — 2026-07-21

### Removed
- DIY HTML5 `<video>` overlay player (audio-only HEVC black screens, foreign controls). **Jellyfin’s player or fail** — no substitute UI.

## 0.1.6 — 2026-07-21

### Fixed
- `no_playback_manager` on JF 10.11/Desktop: `playbackManager` is not on `window` — play via fullscreen stream `<video>` overlay (PM used only if exposed)
- Weak Torznab matches for titles like “Straight A's to XXX”: stopword-aware similarity + 0.67 gate (drops “Straight To The A …”)
- Growing-file cache left tmpfs `/tmp` (filled RAM) — now **`/home/brandon/cache/swarmplay`** on btrfs (same tree as strmarr/arr), overridable via `SWARMPLAY_CACHE_DIR`

## 0.1.5 — 2026-07-21

### Fixed
- Odyssey (and other cold Ensures) failed with a fake “invalid torrent identity”: Jellyfin could not `mkdir` under `/tmp/swarmplay` owned by the lab user — deploy now makes the cache sticky/world-writable and native returns `io_error` (-5) for real permission failures

### Added
- Series release picker filters: Episode vs Batch/season, season/episode numbers, release-group dropdown, text contains (caps list at 40)

## 0.1.4 — 2026-07-21

### Fixed
- Torznab picker showed **0B** for every release: Prowlarr size lives in RSS `<size>`, not only `torznab:attr`
- “Playing” toast with no player: Desktop ignores Path-only fake items — play via `GET /Swarmplay/swarm/stream` Http MediaSource

### Changed
- After release select: toast **warming** → play-bind → real `playbackManager.play` attempt; only toast “playing” if a player engages

## 0.1.3 — 2026-07-21

### Fixed
- `native_error_-2` now surfaces in English: invalid torrent identity (rejected infohash/magnet)
- All native Ensure/play-bind errors carry `Message` for transparent toasts

### Changed
- Play opens a **fast ranked Torznab picker** (not auto-lucky blocking Ensure)
- Selecting a release → play-bind with strmarr-style file_index pick (SxxExx / largest video)
- Native `swarm_list_files` + re-bind file index on existing torrents

## 0.1.2 — 2026-07-21

### Fixed
- Play called fixture Torznab stubs with no magnets → Ensure never started (“still warming up” forever)
- Torznab URLs mangled on save (`…/swarmplay/http:/127.0.0.1…`); normalize on read/save
- Prowlarr magnets live in `<guid>`, not `<link>` — parser now accepts guid/magneturl

### Added
- `POST /Swarmplay/swarm/lucky` — live Torznab → rank #1 → play-bind
- Play button drives lucky + best-effort `playbackManager.play` when Path ready

### Fixed (Ensure)
- Native Ensure preferred magnet URI over BTIH; ANSI P/Invoke corrupted magnets → `native_error_-2`
- Metadata wait raised 5s → 60s for cold DHT fetches

## 0.1.1 — 2026-07-21

### Fixed
- Swarmplay discovery search was dead: ADR-004 left `JellyseerrShowSearchResults=false`, and re-enabling poster chrome still gated on that flag after removing fixtures
- Admin TMDB Test called `/JellyfinEnhanced/tmdb/validate` (404) after route rename to `/Swarmplay`

### Changed
- Commit gate: `offline_client_integrity_check.py` + `live_public_config_smoke.py` (route rename + discovery flags)

## 0.1.0 — 2026-07-21

First tagged Swarmplay cut for local integration testing (Jellyfin Desktop +
local JF host). Not a public GitHub release.

### Added
- JE-fork plugin surface with Seerr/*arr clients unloaded / tasks quarantined
- In-process libtorrent Ensure / status / stop (`torrent/native`)
- `POST /Swarmplay/swarm/play-bind` virtual Path binder (O6a, no STRM)
- Local commit gate `scripts/ci_gate.sh` (ADR-005)
- Packaging script `scripts/package_release.sh`

### Notes
- Runtime is Jellyfin + this plugin + `libswarmplay_native.so` only
- strmarr lab stack is not part of this release; keep symlink for lore only
