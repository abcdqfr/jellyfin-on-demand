# ADR-005: Local integration is the commit gate

**Status:** Accepted

**Date:** 2026-07-21

## Context

Offline unit checks can pass while Ensure, native libtorrent, or Jellyfin
plugin load are broken. Jellyfin on Demand’s spine is living-room JF → magnet →
in-process libtorrent → growing file → Play. A green tree that never exercised
that path is fiction.

The operator client is **Jellyfin Desktop** (and other real JF clients) against
a local Jellyfin host that loads this plugin — not a mock UI.

## Decision

1. **`scripts/ci_gate.sh` is required before commit.** The repo `pre-commit`
   hook runs it. No skip flag, no “docs-only” escape hatch in the hook.
2. The gate must prove **real** local behavior, not mocks of the spine:
   - offline pure checks (`scripts/offline_check.sh`), including **client/route
     integrity** (no stale `/JellyfinOnDemand/` admin API URLs; Jellyfin on Demand
     discovery must not be gated off by legacy `JellyseerrShowSearchResults=false`)
   - plugin build (`JellyfinTarget=jf10`)
   - native library present (`libjellyfin_on_demand_native.so`)
   - local seeder → native Ensure
   - user-scoped Jellyfin → `POST /JellyfinOnDemand/swarm/play-bind` → ready Path →
     Jellyfin’s `ffprobe` reads the growing file (same open path JF Desktop /
     ffmpeg would use for Play)
   - when system JF is up: `live_public_config_smoke.py` (discovery + route rename)
3. **It works for real or it does not commit.** Every iteration ships a **bumped
   hotfix tag** after gate green. CI elsewhere must call the same script; remote
   checks are not a substitute for the local gate.
4. **strmarr symlink stays** under `third-party/strmarr` for lessons/path
   reference (I10: no code import). **Do not run strmarr services** for
   Jellyfin on Demand development or CI. Do not gate on strmarr being up.

## Consequences

- Developers need local Jellyfin 10.11, libtorrent, and the repo `.tools/dotnet`
  SDK (or equivalent) to commit. Jellyfin Desktop is the human playback client.
- Failures are product failures: fix Ensure/native/plugin, don’t weaken the gate.
- Sister-repo lore is available via symlink; Jellyfin on Demand runtime never depends on
  strmarr processes.
