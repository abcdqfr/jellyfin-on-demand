# ADR-004 (swarmplay): One product — no Seerr fork

**Status:** Accepted

**Date:** 2026-07-21

## Context

JE’s living-room discovery/request UX is a **client of Seerr/Jellyseerr**. That
raised whether swarmplay must also fork Seerr (second codebase + second
deploy) or can absorb those jobs into the JE fork alone.

Old *arr world:

```text
JF (JE) → Seerr → *arr → download client → library → JF play
```

Swarmplay spine:

```text
JF (Swarmplay plugin) → Torznab/magnet → libtorrent (O7a) → Path → Play
```

## Decision

1. **One product minimum:** the JE fork
   ([`plugin/Jellyfin.Plugin.Swarmplay/`](../../plugin/Jellyfin.Plugin.Swarmplay/))
   owns browse, pick, warm, and play. C# is the server side; injected JS is the
   pane. That is already “server-side changes.”
2. **Do not fork Seerr/Jellyseerr** for MVP (or as a required half of the
   product). A Seerr process in the middle reintroduces hop/auth/deploy friction
   and still leaves O6a/O7a in the JF plugin.
3. **Retarget, don’t proxy:** keep JE discovery/search/modal chrome; replace
   Seerr API calls with Swarmplay plugin APIs (TMDB/TVDB browse as needed,
   Torznab rank, magnet, `Ensure`). “Request” becomes Play / feeling-lucky.
4. **Seerr as prior art only** — local shallow clone at
   [`third-party/seerr/`](../../third-party/seerr/) for reading/unification
   patterns; never a second living-room UI (I4). License: MIT — see
   [`ATTRIBUTION.md`](../../ATTRIBUTION.md).

## Consequences

- Phase 0 guts Seerr/*arr **clients** and scheduled Seerr sync tasks; keeps
  pane/proxy/settings patterns for Torznab credentials.
- No dependency on a running Seerr instance for any MVP path.
- Two-process shape returns only as **O7b sidecar** (libtorrent isolation), not
  as a request-manager fork.
- Copying Seerr code into the GPL-3 plugin is allowed under MIT if copyright
  notices are preserved and logged in ATTRIBUTION.
