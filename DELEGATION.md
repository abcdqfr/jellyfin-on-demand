# Offline delegation map

**Purpose:** Exhaust **everything we can finish without network / restore /
live JF / libtorrent**, as subagent-sized jobs. Parent agent only routes.
Aligns with [`ROADMAP.md`](ROADMAP.md), [`TRAVEL.md`](TRAVEL.md), ADRs.

**Hard rules for every brief:** `OFFLINE ONLY. No network. No nuget/pnpm/git
pull. Token-minimize. Return ONLY: DONE / FILES / BLOCKERS.`

**Legend:** `O` = offline OK · `W` = needs Wi‑Fi/build/test · `D` = done

---

## Brief template (copy into `Task`)

```text
OFFLINE ONLY. No network. Token-minimize.
Scope: <one path or one deliverable>
Read first (max): <≤3 files>
Do: <bullet>
Do not: touch jellyseerr/arr product spine; no mass rename; no restore.
Return ONLY:
DONE: …
FILES: …
BLOCKERS: none|…
```

Prefer parallel `Task` calls when jobs don’t share write targets.

---

## Phase 0 — Bones

| ID | Status | Deliverable | Write scope | Read (max) |
|----|--------|-------------|-------------|------------|
| P0-01 | D | ADRs / PRODUCT / INVARIANTS | — | — |
| P0-02 | D | Seerr/*arr scripts unloaded | `js/plugin.js` | — |
| P0-03 | D | Swarm stubs + SwarmController | `Swarm/`, `Controllers/SwarmController.cs`, `js/swarm/` | — |
| P0-04 | D | Design pack + fixtures + magnet UX | `docs/design/` | — |
| P0-05 | D | **C# Seerr/*arr dead-code quarantine** — `#if false` or stub scheduled-task registrations so Seerr tasks never run; do not delete wholesale yet | `Plugin.cs` or wherever tasks register; `ScheduledTasks/*Seerr*` | Plugin entry + 1 task file |
| P0-06 | D | **Config page Seerr/Arr panels** — hide or mark “disabled in Swarmplay” in config HTML (no Seerr enable UX) | config HTML under plugin | config page path via grep once |
| P0-07 | D | **ATTRIBUTION steal-log hygiene** — add row template examples; note GPL/MIT when retargeting | `ATTRIBUTION.md` only | — |
| P0-08 | D | **SWARMPLAY.md + plugin README** sync to this map | fork `SWARMPLAY.md`, `plugin/README.md` | this file |
| P0-09 | D | Full assembly/namespace rename | see `docs/design/rename-inventory.md` | — |
| P0-10 | D | `git init` sibling root / push | — | — |

---

## Phase 1 — Play path (offline slice vs Wi‑Fi)

| ID | Status | Deliverable | Write scope | Notes |
|----|--------|-------------|-------------|-------|
| P1-01 | D | **Warm priority pure logic** — C# or tiny portable class: given piece ranges, assert tail→head→seq order; no libtorrent | e.g. `Swarm/WarmPlanner.cs` + markdown test table | Unit-testable offline later |
| P1-02 | D | **`ready` decision table** — expand ensure-ready into fixture JSON (inputs → ready bool) | `docs/design/fixtures/ready-cases.json` | |
| P1-03 | D | **Virtual-item design** — how JF MediaSource Path is set on plugin-owned item; no library row | `docs/design/virtual-item.md` ≤80 lines | O6a |
| P1-04 | D | **Magnet UX stub JS** — `js/swarm/magnet.js` calling `JE.swarm.ensure`; no Seerr; wire into plugin.js load list only | `js/swarm/`, `js/plugin.js` | UI can be minimal DOM |
| P1-05 | D | **Play binding sketch** — sequence diagram paste→Ensure→set Path→Play | `docs/design/play-binding.md` | |
| P1-06 | D | **Native header stubs only** — `torrent/native/include/*.h` matching `docs/design/native-bridge.md` ABI; empty `.cpp` stubs OK | `torrent/native/` | No compile |
| P1-07 | D | libtorrent link + real Ensure | `torrent/native/` | packages |
| P1-08 | D | Integration: magnet → growing file via JF Ensure (+ready); virtual-item Play still open | `scripts/jf_ensure_local_smoke.py` | JF host |
| P1-09 | D | **Local CI gate** — `scripts/ci_gate.sh` + pre-commit; play-bind + ffprobe (ADR-005) | `scripts/ci_gate.sh`, `docs/adr/005-*.md` | |

---

## Phase 2 — Discovery + rank (offline slice)

| ID | Status | Deliverable | Write scope | Notes |
|----|--------|-------------|-------------|-------|
| P2-01 | D | **Ranker pure scorer** — implement score() from `ranker.md` against `fixtures/ranker-cases.json` (C# or JS); print/assert expected_order | `Swarm/Ranker.cs` or `js/swarm/ranker.js` + note in design | No Torznab network |
| P2-02 | D | **Torznab DTO + XML/JSON parser stub** — parse **fixture** indexer payloads only | `Swarm/Torznab/` + `docs/design/fixtures/torznab-sample.xml` | Hand-written sample |
| P2-03 | D | **Config knobs draft** — Torznab URLs, rank weights, min seeders in PluginConfiguration (defaults only; unused) | `Configuration/PluginConfiguration.cs` | |
| P2-04 | D | **Title→releases UI stub** — ranked list DOM calling stub search that returns fixture | `js/swarm/releases.js` | |
| P2-05 | D | **Feeling-lucky path** — one function: rank fixtures → ensure #1 | `js/swarm/lucky.js` | per magnet-lucky-ux |
| P2-06 | D | **TMDB/TVDB browse design** — endpoints we will call server-side; no keys fetched | `docs/design/metadata-browse.md` | |
| P2-07 | D | **Retarget map checklist** — per `js/jellyseerr/*` file: delete / keep-chrome / rewrite target | `docs/design/jellyseerr-file-disposition.md` | Local list only |
| P2-08 | W | Live Torznab Nyaa/TPB | — | network |
| P2-09 | W | E2E title → lucky → play | — | JF + swarm |

---

## Phase 3 — Harden (offline lore only)

| ID | Status | Deliverable | Write scope |
|----|--------|-------------|-------------|
| P3-01 | D | **Seed/idle policy draft** from LESSONS §11b → Swarmplay config shape | `docs/design/seed-idle-policy.md` |
| P3-02 | D | **Multi-file picker UX note** | `docs/design/file-index-picker.md` |
| P3-03 | D | **Client matrix template** (Fire TV / web / etc.) empty checklist | `docs/design/client-matrix.md` |
| P3-04 | D | **Torznab secret proxy rules** (bind, allowlist, never browser) | `docs/design/torznab-proxy.md` |
| P3-05 | W | Packaging / Debian deps | — |

---

## Phase 4 — O7b (docs only offline)

| ID | Status | Deliverable | Write scope |
|----|--------|-------------|-------------|
| P4-01 | D | **Sidecar API sketch** = Promote in-proc Ensure to HTTP (already in plugin README) + auth/bind notes | `docs/design/o7b-sidecar.md` |
| P4-02 | D | **Sister-product lore index** — external path names only; tree not vendored | `docs/design/strmarr-cherry-pick-index.md` |
| P4-03 | W | Implement swarmplayd | — |

---

## Suggested offline batches (parallel)

Run as parallel `Task` groups; one write-scope per agent.

### Batch A — design closeout
`P1-02`, `P1-03`, `P1-05`, `P2-06`, `P3-01`, `P3-04`

### Batch B — pure logic
`P1-01`, `P2-01`, `P2-02` (+ torznab fixture)

### Batch C — JS stubs
`P1-04`, `P2-04`, `P2-05` (+ plugin.js load lines only)

### Batch D — quarantine / config
`P0-05`, `P0-06`, `P2-03`, `P2-07`

### Batch E — native headers + Phase4 docs
`P1-06`, `P4-01`, `P4-02`, `P3-02`, `P3-03`

### Stop condition (offline complete)
All `O` rows checked; only `W` rows remain → pause until reliable data for restore/build/JF/libtorrent.

---

## Wi‑Fi window
See [Wi-Fi warmup](docs/design/wifi-warmup.md) for the one-time cache/build checklist.

## Wi‑Fi gate (do not schedule as offline Tasks)

- `dotnet restore` / build / load in JF  
- libtorrent-dev + native compile  
- Live Torznab / TMDB keys / play tests  
- Mass rename + new GUID  
- git push / CI / deepen clones  

---

## Tracking

Parent: after each batch, tick IDs here and mirror one line in `TRAVEL.md`.
Do not re-dump ROADMAP into chat — point here.

## O2 — machine-local (no apt/nuget)

- `scripts/offline_check.sh`
- `scripts/offline_ranker_check.mjs`
- `scripts/offline_ready_check.py`
- `scripts/offline_torznab_check.py`
- `scripts/offline_warm_order_check.py`
- `scripts/offline_growing_file_check.py`

W still needs the .NET SDK and libtorrent headers for C#/native work.
