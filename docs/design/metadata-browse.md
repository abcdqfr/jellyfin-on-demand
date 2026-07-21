# Metadata browse (P2-06)

## Boundary

Browse metadata is server-side only. The browser receives normalized title-pane
data from Swarmplay; it never calls TMDB or TVDB directly.

Credentials, bearer tokens, and API keys remain in server configuration and
are never sent to JavaScript, logs, URLs, or Jellyfin client responses.

## Planned upstream paths

No request is made by this design. These are the paths the server integration
will call when enabled.

### TMDB

- `/3/search/movie`
- `/3/search/tv`
- `/3/movie/{movie_id}`
- `/3/tv/{series_id}`
- `/3/tv/{series_id}/season/{season_number}`
- `/3/movie/{movie_id}/images`
- `/3/tv/{series_id}/images`

### TVDB v4

- `/v4/search`
- `/v4/movies/{movie_id}`
- `/v4/series/{series_id}/extended`
- `/v4/series/{series_id}/episodes/default`

## Virtual title pane

Metadata creates a browse-only virtual title pane, not a Jellyfin library item
and not a playable media source. It maps upstream fields to:

| Pane field | Source |
|---|---|
| title, year, overview, poster/backdrop | TMDB movie or TV detail |
| type and stable external IDs | TMDB result/detail |
| seasons and episode labels | TMDB season; TVDB series/episodes when needed |
| release-search identity | normalized title, year, TMDB/TVDB IDs |

Selecting an episode or movie passes its title identity to release search. Only
after a release is selected does the existing virtual-item flow bind a `btih`
and file index for playback. Metadata alone never creates scanner-visible
content, a `.strm`, or a `MediaSource.Path`.

## Failure behavior

If metadata is unavailable, show search/manual-title entry and keep magnet and
release workflows usable. Do not expose provider error bodies or secret-bearing
request details to clients.
