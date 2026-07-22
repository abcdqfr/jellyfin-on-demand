# ADR-003 (jellyfin-on-demand): Fork Jellyfin Enhanced (O4b)

**Status:** Accepted

**Date:** 2026-07-20

## Context

Living-room discovery UX already exists in Jellyfin Enhanced (pane, proxy,
settings, TMDB-adjacent discovery). Building a greenfield companion plugin
duplicates that shell. Jellyfin on Demand’s acquisition spine is Torznab/magnet +
libtorrent, not Seerr/*arr — so the fork must gut that stack.

## Decision

1. **O4b:** Fork [n00bcodr/Jellyfin-Enhanced](https://github.com/n00bcodr/Jellyfin-Enhanced)
   as [abcdqfr/Jellyfin.Plugin.JellyfinOnDemand](https://github.com/abcdqfr/Jellyfin.Plugin.JellyfinOnDemand).
2. Work from nested clone at `plugin/Jellyfin.Plugin.JellyfinOnDemand/` under the
   jellyfin-on-demand sibling root.
3. Keep `third-party/jellyfin-enhanced/` as a pristine upstream reference.
4. Rename identity to Jellyfin on Demand; remove Seerr/*arr **client** surfaces; keep
   injection/proxy/pane patterns. Retarget those UIs to Jellyfin on Demand APIs — **do
   not** introduce a Seerr fork ([ADR-004](004-one-product-no-seerr-fork.md)).

## Consequences

- Merge from `upstream` carefully; expect conflict on Seerr/*arr paths we delete.
- GPL-3.0 of JE applies to the fork — keep license compliance.
- Roadmap Phase 0 owns rename + gut; see [`ROADMAP.md`](../../ROADMAP.md).
- Low-data travel work: [`TRAVEL.md`](../../TRAVEL.md).
