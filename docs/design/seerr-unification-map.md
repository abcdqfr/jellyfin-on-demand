# Seerr → Swarmplay API map (unification reading)

**Source:** local `third-party/seerr/` (shallow). **MIT** — log copies in
[`ATTRIBUTION.md`](../../ATTRIBUTION.md). **Do not** run Seerr (ADR-004).

## Jobs Seerr owns today → where they go in Swarmplay

| Seerr concern | Seerr location (approx) | Swarmplay home |
|---------------|-------------------------|----------------|
| Title search / discover | `server/routes/search.ts`, `discover.ts`; OpenAPI `/search`, `/discover/*` | Plugin C#: TMDB/TVDB (+ optional direct); JS discovery chrome retargeted from `js/jellyseerr/*` |
| Media details | `movie.ts`, `tv.ts`, `person.ts` | Plugin metadata helpers; virtual item fields |
| **Request** (queue *arr) | `request.ts`, `/request` | **Replace** with Torznab rank + magnet/`Ensure` + Play |
| Radarr/Sonarr service | `service.ts`, `/service` | **Delete** — out of MVP |
| Users / permissions | `auth.ts`, `user/` | JF users only for MVP; no Seerr account link |
| Watchlist / blocklist | `watchlist.ts`, `blocklist.ts` | Defer; optional JF watchlist later |
| Images proxy | `imageproxy.ts` | Optional; JE CDN patterns already exist |

## OpenAPI tags to ignore vs harvest

**Harvest (shapes):** `search`, `movies`, `tv`, `person`, `other` (TMDB-ish).

**Ignore / gut:** `request`, `service`, `watchlist` (as Seerr), `issue*`.

## UI components worth staring at (not shipping Seerr)

Under `src/components/`: `Discover/*`, `RequestButton` (become Play / Lucky),
`MovieDetails`, `GenreCard`, `PersonCard`, `MediaSlider`.

JE already injects analogous chrome in `js/jellyseerr/`. Prefer **retarget JE
JS** over importing Seerr’s Next/React app into JF.

## Steal policy

- Prefer **ideas and API field lists** over pasting Seerr TS into the plugin.
- If copying: MIT notice + ATTRIBUTION steal-log row.
- Never add a Seerr runtime dependency.
