# Search history (0.2)

**ADR:** [006](../adr/006-search-history-v0.2.md)  
**Status:** design for implementation — commemorative **v0.2.0**

## Goals

- Remember TMDB/Torznab searches and successful plays from the living-room pane.
- Manage history: open again, pin, delete one, clear all, auto-prune.
- Same history on every JF client for that user (server-backed JSON).

## Non-goals (0.2)

- Promoting swarm cache into the library (→ [0.3](library-promote-0.3.md)).
- Cross-user shared history.
- Full “continue watching” replacement for JF’s own CW.

## Record shape (draft)

```json
{
  "id": "uuid",
  "query": "To Love Ru",
  "mediaType": "tv",
  "tmdbId": 12345,
  "title": "To LOVE-Ru",
  "year": "2008",
  "searchedAt": "ISO-8601",
  "lastPlayedAt": null,
  "lastBtih": null,
  "lastReleaseTitle": null,
  "pinned": false
}
```

## API (plugin)

| Method | Path | Role |
|--------|------|------|
| GET | `/Swarmplay/swarm/history` | List (pinned first, then recency) |
| POST | `/Swarmplay/swarm/history` | Upsert from search / play |
| POST | `/Swarmplay/swarm/history/{id}/pin` | Toggle pin |
| DELETE | `/Swarmplay/swarm/history/{id}` | Remove one |
| DELETE | `/Swarmplay/swarm/history` | Clear unpinned (or all with `?all=1`) |

Persist via existing user-settings file helper (same directory as other JE user JSON).

## UI

1. **History entry** in discovery (icon / tab) — list with title, year, last played.
2. Tap → re-open title pane (TMDB id) or re-run Torznab query if id missing.
3. Long-press / menu: Pin, Remove, Clear unpinned.
4. Auto-record: successful Torznab search (query) and successful play-bind (btih + release).

## Caps

- Max **100** unpinned; pinned excluded from LRU.
- No poster blobs in JSON — resolve art from TMDB at display time.

## Gate

- Offline: schema + prune unit check.
- Live: POST → GET round-trip as authenticated user in `ci_gate` or smoke.
