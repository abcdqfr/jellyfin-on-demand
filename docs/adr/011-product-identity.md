# ADR-011: Product identity — Jellyfin on Demand

**Status:** Accepted

**Date:** 2026-07-22

## Context

The working tree began as a GitHub fork of Jellyfin Enhanced under an earlier experimental brand, then
partially renamed toward Jellyfin on Demand. Assembly/routes were already
`JellyfinOnDemand`, but the runtime still displayed **Jellyfin Enhanced**,
shared JE’s plugin GUID, and pointed catalogs/docs at upstream release assets.

Separately, Jellyfin’s branding guidance discourages names that can look
official. This project still chose **Jellyfin on Demand** as the public product
name (repo `abcdqfr/jellyfin-on-demand`) because it already matched local
identity and the demand-driven catalog thesis; affiliation disclaimers stay
explicit.

## Decision

1. **Product name:** Jellyfin on Demand (identifiers `JellyfinOnDemand` /
   `jellyfin-on-demand`; API `/JellyfinOnDemand/...`).
2. **Code ancestor:** keep the Jellyfin Enhanced fork history; provenance is
   “derived from Jellyfin Enhanced,” not product branding.
3. **Seerr:** API/integration + selective UI/code only — not a primary fork
   ([ADR-004](004-one-product-no-seerr-fork.md)).
4. **Plugin GUID:** `935a72b9-7639-473b-bb54-4259f7a9695c` (new; do not share
   JE’s GUID when publishing).
5. **GitHub:** public repo `abcdqfr/jellyfin-on-demand` (renamed from the
   earlier experimental fork repo name); remotes `origin` → that repo,
   `upstream` → `n00bcodr/Jellyfin-Enhanced` when wiring history merges.
6. **Client global:** `window.JellyfinOnDemand` (+ `JE`); optional legacy
   `window.JellyfinEnhanced` alias; migrate old `localStorage` keys on load.

## Consequences

- Side-by-side install with Jellyfin Enhanced is possible (distinct GUID).
- Upgrades from early half-renamed builds that reused JE’s GUID look like a
  different plugin to Jellyfin — reinstall/config may be required.
- Docs and issue links target `abcdqfr/jellyfin-on-demand`; upstream JE remains
  cited in ATTRIBUTION / ADRs only as provenance.
- README/PRODUCT must state: independent community project, not affiliated with
  Jellyfin, Jellyfin Enhanced, or Seerr.

## Branch strategy

Local/product history and GitHub’s inherited JE `main` tip do **not** share a
merge-base. To keep upstream merges tractable:

1. Publish product commits on branch **`product`** (this ADR’s identity work).
2. Leave **`main`** free to track `upstream/main` (n00bcodr/Jellyfin-Enhanced)
   for inspect/cherry-pick/merge.
3. Do **not** force-push product history onto `main` unless deliberately
   replacing the fork tip (requires explicit owner sign-off).

```text
upstream/main  (JE)
      │
origin/main    (optional JE sync)
origin/product (Jellyfin on Demand releases / tags)
```

