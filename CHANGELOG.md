# Changelog

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
