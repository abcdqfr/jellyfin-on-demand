# ADR-003 (swarmplay): Fork Jellyfin Enhanced (O4b)

**Status:** Accepted

**Date:** 2026-07-20

## Context

Living-room discovery UX already exists in Jellyfin Enhanced (pane, proxy,
settings, TMDB-adjacent discovery). Building a greenfield companion plugin
duplicates that shell. Swarmplay’s acquisition spine is Torznab/magnet +
libtorrent, not Seerr/*arr — so the fork must gut that stack.

## Decision

1. **O4b:** Fork [n00bcodr/Jellyfin-Enhanced](https://github.com/n00bcodr/Jellyfin-Enhanced)
   as [abcdqfr/Jellyfin.Plugin.Swarmplay](https://github.com/abcdqfr/Jellyfin.Plugin.Swarmplay).
2. Work from nested clone at `plugin/Jellyfin.Plugin.Swarmplay/` under the
   swarmplay sibling root.
3. Keep `third-party/jellyfin-enhanced/` as a pristine upstream reference.
4. Rename identity to Swarmplay; remove Seerr/*arr **client** surfaces; keep
   injection/proxy/pane patterns. Retarget those UIs to Swarmplay APIs — **do
   not** introduce a Seerr fork ([ADR-004](004-one-product-no-seerr-fork.md)).

## Consequences

- Merge from `upstream` carefully; expect conflict on Seerr/*arr paths we delete.
- GPL-3.0 of JE applies to the fork — keep license compliance.
- Roadmap Phase 0 owns rename + gut; see [`ROADMAP.md`](../../ROADMAP.md).
- Low-data travel work: [`TRAVEL.md`](../../TRAVEL.md).
