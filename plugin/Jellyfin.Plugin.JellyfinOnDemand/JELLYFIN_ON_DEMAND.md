# Jellyfin on Demand (JE fork)

This tree is **Jellyfin on Demand**: a Jellyfin Enhanced fork that adds on-demand
discovery and BitTorrent-backed playback (btih + libtorrent).

**Seerr/Jellyseerr is not a runtime dependency**
([ADR-004](../../docs/adr/004-one-product-no-seerr-fork.md)). The discovery
UI that upstream JE used as a Seerr *client* is **rolled into this plugin**
(`js/jellyseerr/*` chrome + Discover pane) and retargeted to TMDB +
Play / Lucky / Library. See [`../../ATTRIBUTION.md`](../../ATTRIBUTION.md)
for GPL (JE) and MIT (seerr pattern takes) notices.

Product identity / GUID / GitHub: [ADR-011](../../docs/adr/011-product-identity.md).
Branching for upstream merges: keep product work on branch `product`; leave
GitHub `main` aligned with upstream JE when possible.

Progress map: [`../../DELEGATION.md`](../../DELEGATION.md).
