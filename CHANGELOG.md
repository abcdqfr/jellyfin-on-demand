# Changelog

## Unreleased

### Planned
- **0.3** — Library promote / offline archival ([design](docs/design/library-promote-0.3.md))

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
