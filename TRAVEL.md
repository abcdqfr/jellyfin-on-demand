# Travel / low-data mode

**Constraint (active until revoked):** cellular data budget — **no downloads,
clones, pulls, package restores, image pulls, or other bandwidth beyond chat**
(except the approved Seerr shallow clone already on disk). Work only against
trees already on disk.

## Agent workflow (token + data minimization)

Full offline job map: [`DELEGATION.md`](DELEGATION.md).

Until Wi‑Fi / testing budget is restored:

1. **Parent agent:** route only — short briefs, no broad repo dumps.
2. **Subagents (`Task`):** do bounded offline edits; return a short structured
   result (done / files / blockers). Prefer `explore` or `generalPurpose` with
   a hard file/path scope.
3. **No network** in subagents (no clone/pull/restore/WebFetch) unless the user
   explicitly allotments bandwidth again.
4. **Prefer local reads** already on disk; avoid re-reading large JE/Seerr trees
   wholesale — point at known paths from `docs/design/` and `TRAVEL.md`.

## Already local (use these)

| Path | What’s there |
|------|----------------|
| `plugin/Jellyfin.Plugin.JellyfinOnDemand/` | Working JE fork (~170M); Seerr/*arr scripts **not loaded** |
| `third-party/jellyfin-enhanced/` | Pristine JE reference (~170M) |
| `third-party/seerr/` | Shallow Seerr source (~18M) — patterns only; ADR-004 |
| `third-party/vlc-bittorrent/` | libtorrent glue prior art (~2M) |
| `third-party/strmarr/` | Sister symlink — lessons only; **do not run services** |
| Root docs | PRODUCT, INVARIANTS, ROADMAP, ADRs, ATTRIBUTION, `docs/design/*` |

**Do not fetch further without a new allotment:** NuGet, npm/pnpm for Seerr,
Docker images, `git pull` / `upstream` merges, GH releases. Seerr is already
on disk — **read it; do not install its deps on cellular.**

Attribution / steal log: [`ATTRIBUTION.md`](ATTRIBUTION.md).

## Intention (documented)

**One product = JE fork.** No Seerr fork. See
[`docs/adr/004-one-product-no-seerr-fork.md`](docs/adr/004-one-product-no-seerr-fork.md).

## What we *can* do while traveling

### Docs / design (zero network)

- [x] Keep ADRs / ROADMAP / PRODUCT aligned with ADR-004
- [x] Spec `Ensure` / `ready` — [`docs/design/ensure-ready.md`](docs/design/ensure-ready.md)
- [x] Spec ranker — [`docs/design/ranker.md`](docs/design/ranker.md)
- [x] Native bridge sketch — [`docs/design/native-bridge.md`](docs/design/native-bridge.md)
- [x] Seerr → Swarm map — [`docs/design/seerr-unification-map.md`](docs/design/seerr-unification-map.md)
- [x] Rename inventory — [`docs/design/rename-inventory.md`](docs/design/rename-inventory.md)
- [x] Mine cache/seed knobs (lore) → LESSONS §11b
- [x] Draft magnet-paste / feeling-lucky UX notes (DOM flow) against stub `JE.swarm`
- [x] Table-driven ranker fixture file (JSON) for future unit tests

### Code edits that need no restore/build (offline)

- [x] Disable Seerr/*arr script load in `js/plugin.js`
- [x] Force Seerr discovery defaults off in `PluginConfiguration`
- [x] Stub `js/swarm/api.js` + `Swarm/ISwarmSession.cs`
- [x] manifest display name → Jellyfin on Demand
- [ ] Full namespace/assembly rename (~124 files) — **wait for Wi‑Fi build**
- [x] Stub `SwarmController` (local StubSwarmSession; DI later)
- [ ] Retarget one discovery UI file to call `JE.swarm` (optional travel stretch)

### Explicitly wait for unlimited bandwidth

- `dotnet restore` / build / JF plugin deploy smoke
- libtorrent-dev install, native compile
- Torznab live integration tests
- Full (or deepen) git history if needed
- `git push` / CI / upstream merge
- Mass rename + new plugin GUID publish

## Phase 0 gut inventory (local paths under fork)

**Retarget later (chrome kept on disk, not loaded):**

- `js/jellyseerr/ui.js`, `modal.js`, `more-info-modal.js`, `*-discovery.js`,
  `discovery-filter-utils.js`, `seamless-scroll.js`, `request-manager.js`

**Not loaded (Seerr/*arr clients):** entire `js/jellyseerr/*`, `js/arr/*`

**Still to delete/stub in C# when building:** `Helpers/Jellyseerr/*`,
`ScheduledTasks/*Seerr*`, Arr services — lower priority while scripts are off.

## Suggested travel order (updated)

```text
1. Design docs + gates + stubs          ✅
2. UX notes for magnet / lucky vs stub
3. Ranker fixture JSON
4. Optional: stub SwarmController (no NuGet — edit only)
5. At Wi‑Fi: restore, build, rename, Ensure spike
```

## Status

**Offline O-rows complete** (see DELEGATION.md). Remaining work is **W**: restore/build, libtorrent, live Torznab/JF play, push.
