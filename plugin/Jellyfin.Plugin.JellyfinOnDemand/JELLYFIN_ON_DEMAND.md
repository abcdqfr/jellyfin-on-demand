# Jellyfin on Demand fork

This Jellyfin Enhanced fork is Jellyfin on Demand: Jellyfin playback backed by btih and
libtorrent.

**Seerr/Jellyseerr is not a runtime dependency**
([ADR-004](../../docs/adr/004-one-product-no-seerr-fork.md)). The discovery
UI that upstream JE used as a Seerr *client* is **rolled into this plugin**
(`js/jellyseerr/*` chrome + Jellyfin on Demand Discover pane) and retargeted to TMDB +
Play / Lucky / Library. See [`../../ATTRIBUTION.md`](../../ATTRIBUTION.md)
for GPL (JE) and MIT (seerr pattern takes) notices.

Offline Phase 0 is complete for gates, stubs, controller, config UI hiding,
and task quarantine. The assembly/namespace rename remains Wi-Fi/build work.

Progress map: [`../../DELEGATION.md`](../../DELEGATION.md).
