# Changelog

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
