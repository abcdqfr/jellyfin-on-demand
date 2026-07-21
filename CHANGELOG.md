# Changelog

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
