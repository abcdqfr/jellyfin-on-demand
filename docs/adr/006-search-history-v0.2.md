# ADR-006: Search history as the 0.2 commemorative surface

**Status:** Accepted

**Date:** 2026-07-22

## Context

0.1.x proved Torznab → warm → real Jellyfin Play. Living-room use immediately
needs **memory**: what did we search, what did we play, can we jump back without
re-typing TMDB titles. That is a product surface, not a debug log — it earns a
**0.2** commemorative bump (not another 0.1.x hotfix).

Promoting a streamed swarm item into a normal library folder (offline /
archival) is a different identity problem (Path ownership, library scan, retain
vs seed). That waits for **0.3**.

## Decision

1. **0.2 = Search history + management** (browse, replay, pin, clear, prune).
2. Store per Jellyfin **user** under the plugin’s existing user-settings
   pattern (JSON beside other JE user files) — not browser `localStorage` alone
   (Desktop + multi-client), not a new SQL schema.
3. Each entry records at least: query text, media type, TMDB id (if any),
   timestamps (searched / last played), optional last btih + release title,
   optional pin flag. Cap list size (e.g. 100) with LRU eviction of unpinned.
4. UI lives in the Jellyfin on Demand discovery chrome (history rail / page) — no Seerr.
5. **0.3 = Library slide** (streamed → library Path for offline/archive) is
   roadmap-only until 0.2 ships; see
   [`docs/design/library-promote-0.3.md`](../design/library-promote-0.3.md).

## Consequences

- 0.2 work extends `user-settings` + discovery JS; gate must cover history API
  round-trip.
- Virtual-item / growing-file Path remains play-only until 0.3 explicitly
  defines promote semantics (copy vs hardlink vs re-scan).
