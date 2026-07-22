# swarmplay — roadmap

**Trajectory:** Living-room JF pane (**one product:** JE fork) → TMDB/TVDB →
ranked Nyaa/TPB → magnet → in-process libtorrent (O7a) → tail→head warm →
growing file on a **virtual item** (O6a) → Play. No *arr. No STRM. **No Seerr
process / no Seerr fork** ([ADR-004](docs/adr/004-one-product-no-seerr-fork.md)).

Progress = **unit + integration tests** against [`PRODUCT.md`](PRODUCT.md) MVP.

**Travel / low-data:** [`TRAVEL.md`](TRAVEL.md). **Delegation:** [`DELEGATION.md`](DELEGATION.md).
**Commit gate:** [`scripts/ci_gate.sh`](scripts/ci_gate.sh) ([ADR-005](docs/adr/005-local-integration-commit-gate.md)).

Working plugin tree:
[`plugin/Jellyfin.Plugin.Swarmplay/`](plugin/Jellyfin.Plugin.Swarmplay/)
([abcdqfr/Jellyfin.Plugin.Swarmplay](https://github.com/abcdqfr/Jellyfin.Plugin.Swarmplay),
fork of [n00bcodr/Jellyfin-Enhanced](https://github.com/n00bcodr/Jellyfin-Enhanced)).
Upstream reference clone remains in [`third-party/jellyfin-enhanced/`](third-party/jellyfin-enhanced/).


---

## Version tiers (commemorative)

| Tier | Theme | Status |
|------|--------|--------|
| **0.1.x** | Play path: Torznab → libtorrent → extent gate → real JF player | Shipping (hotfixes) |
| **0.2.0** | **Search history** + management ([ADR-006](docs/adr/006-search-history-v0.2.md), [design](docs/design/search-history.md)) | Next commemorative |
| **0.3.0** | **Library promote** — slide streamed keep into normal library / offline archival ([design](docs/design/library-promote-0.3.md)) | Roadmap after 0.2 |
| later | O7b sidecar, packaging polish | Phase 4 |

### 0.2 — Search history (commemorative)

- [ ] Persist per-user history (query, TMDB id, last btih/play)
- [ ] Discovery UI: list, open again, pin, delete, clear / prune
- [ ] Record on search + successful play-bind
- [ ] Gate: history API round-trip

**Exit:** Living-room can re-enter a prior title without retyping; history is manageable.

### 0.3 — Library promote / archival (after 0.2)

- [ ] Operator archive root + “Keep in library” action
- [ ] Full-file (or policy) materialize out of swarm cache → library Path
- [ ] JF scan + real item; history badge optional
- [ ] Seed/idle interaction documented

**Exit:** Streamed play can become offline-capable library media without *arr/STRM.

---

## Phase 0 — Bones (docs + fork)

- [x] Invariants / product / lessons / ADRs
- [x] Lock O1–O7a MVP; O7b roadmap
- [x] Fork JE → `plugin/Jellyfin.Plugin.Swarmplay/`
- [x] **ADR-004:** one product; do not fork Seerr
- [x] Offline: Seerr/*arr scripts unloaded; Swarm stubs; design docs (`docs/design/`)
- [ ] `git init` this sibling root when you want parent history (optional; plugin is already its own git remote)
- [ ] Rename C# project / plugin id from `JellyfinEnhanced` → `Swarmplay` (see `docs/design/rename-inventory.md`) — **needs Wi‑Fi build**
- [ ] Strip Seerr/*arr C# helpers/tasks (scripts already gated); retarget discovery chrome to Swarm APIs

**Exit:** Plugin identity is Swarmplay; Seerr is not required at runtime; *arr UI gone or inert.

---

## Phase 1 — Virtual title + magnet Play (core play path)

Prove O6a + O2a + O7a without Torznab ranking.

1. **Native bridge spike (O7a)** — C++ (or similar) libtorrent session in JF process; shared session (vlc-bt `Session::get()` shape); `Ensure(btih, file_index, warm)` → path.
2. **Warm tests** — unit: piece priority order is tail→head→sequential; integration: ~5%+~5% then grow; magic bytes at offset 0.
3. **Virtual item** — plugin-owned item; media source Path = growing file; Play / Stop lifecycle.
4. **Magnet paste UX** — on a title (or bare magnet entry), paste → Ensure → Play.
5. **`ready` contract** — define and test (bytes / timeout / fail-open rules); TBD until first play evidence.

**Exit:** Integration test (or manual JF play): magnet → warm → growing file plays on a virtual item. No Torznab required.

---

## Phase 2 — Discovery + ranked pick (MVP complete)

1. **Torznab client** — Nyaa + TPB endpoints in plugin config (server-side; secrets never in browser).
2. **Ranker (I11)** — resolution / source group / seeders / size / language-subs heuristics; strong defaults; best first.
3. **Title pane** — TMDB/TVDB browse → title → ranked release list → pick **or** “I’m feeling lucky” (= rank #1).
4. **End-to-end integration** — title → lucky/pick → warm → Play; magnet escape hatch still works.

**Exit:** MVP in `PRODUCT.md` green under tests + one living-room Play.

---

## Phase 3 — Harden (still pre-sidecar)

1. Multi-file torrents (`file_index` picker).
2. Seek / remux / DirectPlay vs Transcode matrix on target clients (Fire TV etc. — don’t fatten torrent stack for client pain).
3. Disk / idle / leave-seeding policy — apply **lore** from LESSONS cache prefs + seeding options (not foreign code).
4. Proxy hygiene (JE/seerr-bridge patterns) for Torznab credentials.
5. Packaging: Debian deps for libtorrent + plugin zip.

**Exit:** Operator-comfortable single-user MVP.

---

## Phase 4 — Roadmap: O7b sidecar (post-MVP)

- Extract session into `swarmplayd`; plugin speaks control plane HTTP.
- Isolation, shared multi-play bandwidth, seed/eviction supervisor.
- Re-derive long-lived session / cache / seed policy shapes from LESSONS.
- Keep O2a growing file unless evidence forces O2b range bridge.

**Exit:** Sidecar optional or default; MVP path still works.

---

## Explicitly later / out of MVP

- *arr, Seerr **process**, Prowlarr, fake qBittorrent
- **Forking Seerr/Jellyseerr** (ADR-004 — not required; one JF plugin product)
- STRM / library stub trees (O6b/O6c) — **0.3 promote is real library Path, not STRM**
- Go/anacrolix engine
- Multi-user silos
- Spinoff polish (own org branding, docs site) beyond rename

---

## Suggested near-term order of work

```text
0. Stabilize 0.1.x extent gate + Lucky/Play (living-room evidence)
1. **0.2 Search history** (ADR-006) — commemorative bump
2. Rename / gut remaining Seerr chrome as needed
3. Packaging + seed/idle lore
4. **0.3 Library promote** (archive root + Keep)
5. (Later) O7b sidecar
```
