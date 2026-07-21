# swarmplay — product (experimental)

## Mission

Make **pick → swarm → play** work inside Jellyfin (via Jellyfin Enhanced), with
BitTorrent info-hash as the media identity and **sequential bytes** as the only
delivery contract.

## Stack (target)

```text
Jellyfin + swarmplay plugin (TMDB/TVDB → title → ranked Torznab/magnet; virtual item)
        │  (JE fork → Swarmplay plugin; gut Seerr/*arr)
        ▼
libtorrent in JF process (O7a; VLC-shaped shared session)
  tail warm → head warm → sequential
        │
        ▼
growing file path on virtual item (O6a + O2a)
        │
        ▼
Jellyfin ffmpeg / client
```

Roadmap (not MVP): O7b sidecar `swarmplayd` — re-derive session /
seed / cache examples when that work starts.

## Owns

- Binding a **virtual** Jellyfin item (or play session) to **btih + file index**.
- Torznab search (**Nyaa + TPB** first) + magnet paste; **ranked** release list
  in JF (best first; skim-to-choose; “I’m feeling lucky” = rank #1).
- libtorrent session **in the JF process** (O7a): warm **tail then head**, then
  sequential; hand JF a growing file path.
- Companion plugin — JE fork ([`plugin/Jellyfin.Plugin.Swarmplay/`](plugin/Jellyfin.Plugin.Swarmplay/));
  gut Seerr/*arr **clients**; **one product** (no Seerr fork — [ADR-004](docs/adr/004-one-product-no-seerr-fork.md)).

## Non-goals

- `.strm` files or a JF library-scanner tree (virtual items are O6a, not STRM).
- Sister-product-style HTTP `/v1/stream/...` media server.
- In-process anacrolix (or any Go torrent stack) as product identity.
- Sonarr, Radarr, Prowlarr, Seerr **as a required service**, or fake qBittorrent.
- A second living-room app (forked Seerr or otherwise) outside Jellyfin.
- An *arr/STRM database, slot registry, or *arr history resolver.
- Porting sister-product / strmify code — **lessons only** ([`LESSONS.md`](LESSONS.md)).

## MVP (the product)

One living-room path in JF: ranked Nyaa/TPB (or pasted magnet) → pick #1 or
skim-pick → tail then head warm → growing file plays → no STRM, no *arr, no
sister *arr/STRM binary.

Progress is measured with **unit and integration tests** that prove pieces of
this MVP, not by inventing a smaller product and calling it a “slice.”
