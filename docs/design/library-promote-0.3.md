# Library promote / archival (0.3 tier)

**Status:** roadmap only — after **0.2** search history  
**Commemorative target:** **v0.3.0**

## Intent

Slide a title that was played from the swarm (growing file / virtual item) into
a **normal Jellyfin library** path so it can be watched offline or kept as
archive — without becoming *arr or STRM LARPing.

## Problem

Today Path points at `SWARMPLAY_CACHE_DIR/...` (seed/evict lifecycle). Library
items expect a stable folder under a configured media root, scanned by JF, not
evicted when the torrent idles out.

## Draft approach (not decided)

1. **Promote action** from history or player: “Keep in library”.
2. Operator-configured **archive root** (e.g. `/home/brandon/media/swarmplay-keep`).
3. On promote: wait until selected file is **complete** (or copy only warmed
   ranges — almost certainly wrong; prefer full file or explicit “still
   downloading” block).
4. Move or hardlink into archive root with a sane folder name (title / year).
5. Trigger JF library scan; bind real `Movie`/`Episode` (retire virtual item).
6. Stop or keep seeding per seed-idle policy.

## Open questions

- Hardlink vs copy (same filesystem as cache?).
- TV: single episode vs whole season pack promote.
- Interaction with search history (“archived” badge).
- Whether promote is allowed before 100% download.

## Explicitly not 0.3

- Fake download-client / *arr import.
- STRM pointers as the keep mechanism.
- Multi-user per-root silos (unless forced by evidence).

## Exit

One living-room flow: play from swarm → Keep → appears under a normal library
view → playable with swarm stopped / offline.
