# swarmplay — roadmap

**Trajectory:** Living-room JF pane (**one product:** JE fork) → TMDB/TVDB →
ranked Nyaa/TPB → magnet → in-process libtorrent (O7a) → tail→head warm →
growing file on a **virtual item** (O6a) → Play. No *arr. **No Seerr
process / no Seerr fork** ([ADR-004](docs/adr/004-one-product-no-seerr-fork.md)).
Play/Lucky stay non-STRM (real growing-file virtual item, always); the one
deliberate exception is the opt-in **Add to Library → Stream** action, which
writes a real `.strm` pointer by request ([ADR-010](docs/adr/010-strm-add-to-library-v0.4.1.md)).

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
| **0.2.0** | **Search history** + management ([ADR-006](docs/adr/006-search-history-v0.2.md), [design](docs/design/search-history.md)) | Shipping |
| **0.2.1** | **MKV-aware extent gate** — grow to real Cues/head instead of blind fixed floors ([ADR-007](docs/adr/007-mkv-aware-extent-gate.md)) | Shipping |
| **0.2.2** | **Virtual-item probe fix + history UX** — real ffprobe on the bound item, inline history dropdown | Shipping |
| **0.3.0** | **Batch episode fanout** — pick episode inside multi-file TV release ([ADR-008](docs/adr/008-batch-episode-fanout-v0.3.md)) | Shipping |
| **0.4.0** | **Cache-to-library** — Add to Library → download straight into a real JF library ([ADR-009](docs/adr/009-cache-to-library-v0.4.md)) | Shipping |
| **0.4.1** | **Hotfix:** Add to Library → Stream now writes a real `.strm` pointer; warm-progress bar + blazing-ahead readahead-size regression fix ([ADR-010](docs/adr/010-strm-add-to-library-v0.4.1.md)) | Shipping |
| **0.5.0** | **Discover pane** — Seerr-shaped browse home next to Enhanced/Bookmarks (TMDB-backed; JE jellyseerr chrome rolled in) | Shipping |
| later | O7b sidecar, packaging polish | Phase 4 |

### 0.2.2 — Virtual-item probe fix + history UX (0.2.1's exit criteria, actually met)

0.2.1 warmed the right bytes but audio/subs still didn't show up on cold
play — the real bug was one layer up: `BindVirtualMovieAsync` minted the
bound `Movie` with `IsVirtualItem = true`, and Jellyfin's `ProbeProvider`
(`MediaBrowser.Providers.MediaInfo.ProbeProvider.FetchVideoInfo`)
**unconditionally skips ffprobe for any item flagged virtual** — regardless
of `MetadataRefreshMode`. `MediaStreams` stayed `[]` forever, so
PlaybackInfo/ffmpeg fell back to no stream maps (`-sn`, no `-map`) even
though the file itself had real audio/subtitle tracks warm on disk (verified
via direct ffprobe against the growing file). Fix: bound items are real
playable files, not placeholders — `IsVirtualItem = false`, plus an explicit
`RefreshMetadata(FullRefresh)` right after the extent gate confirms
head+tail are warm (only when `MediaStreams` is still empty, so replays of
already-probed items stay cheap). Verified live: a cold play of *This Is
England* (2006) now reports 1 video + 2 audio (AAC 5.1 / stereo) + 1 PGSSUB
subtitle stream, up from 0.

Also folded in this pass: the search-history popup was an omnipresent
floating button + modal, not what was asked for. Replaced with a
browser-address-bar-style dropdown anchored to the native Jellyfin search
field — appears on focus/typing, per-entry remove, one "Clear history"
action, nothing left on screen otherwise.

- [x] `IsVirtualItem = false` on the bound `Movie` (create + update paths)
- [x] Force `RefreshMetadata(FullRefresh)` post-gate when `MediaStreams` empty
- [x] Verified live: real audio + subtitle streams populate on cold play
- [x] History: inline dropdown on `#searchTextInput`, no floating control
- [x] History: per-entry remove (−) + single "Clear history" action

**Exit:** cold play of a real movie has audio + video + subs + working seek
on first attempt — verified against a real torrent, not just synthetic
fixtures.

### 0.2.1 — MKV-aware extent gate (hotfix, before batch/episode fanout)

Ported forensics from strmarr's Tensura cold-gate incident
(`../strmarr/docs/issues/tensura-first-play-cold-gate.md`): blind fixed
head/tail floors cannot know where a given MKV's Cues element actually
lives, and a naive first-byte-match probe can hit false positives inside
the EBML header. Audio/subs/seek on a real movie is a harder floor than
batch fanout for TV episodes — this must land first.

- [x] Native EBML head parse (Segment → Tracks/Attachments only)
- [x] Native growing Cues probe (2 MiB → 16 MiB cap, multi-candidate backward search)
- [x] Cue-less bounded fallback (16 MiB tail, never full-file fail-open)
- [x] `tail_mib`/`head_mib` become floors under the probe, not fixed sizes
- [x] Per-(torrent,file_index) probe cache — no re-parse once warm
- [x] Synthetic-MKV fixtures in the gate (near-miss Cues, false-positive header, cue-less)

**Exit:** cold play of a real movie has audio + video + subs + working seek
on first attempt, verified against a synthetic MKV whose Cues sit outside
the old fixed floor.

### 0.2 — Search history (commemorative)

- [x] Persist per-user history (query, TMDB id, last btih/play)
- [x] Discovery UI: list, open again, pin, delete, clear / prune
- [x] Record on search + successful play-bind
- [x] Gate: history API round-trip

**Exit:** Living-room can re-enter a prior title without retyping; history is manageable.

### 0.3 — Batch episode fanout

Living-room TV packs: one infohash, many files — user picks which episode to
warm and play. Not STRM fan-out (still one virtual item per play).

- [x] `POST /list-files` + `api.listFiles`
- [x] Episode picker UI before play-bind (multi-video TV)
- [x] `FileIndexExplicit` so picker choice is not overwritten
- [x] `FileIndexPicker` absolute-ep / NCOP skip (strmarr lessons)
- [x] History first-click fix (capture focusin/pointerdown)

**Exit:** Pick a season pack → choose SxxExx file → warm + play that episode.

### 0.4 — Cache-to-library (after 0.3)

- [x] "Add to Library" poster button — prompts Stream vs Cache to library
- [x] `swarm_cache_ensure`/`swarm_cache_status` — whole-file download straight
      into the resolved library folder (no hardlink/copy step)
- [x] Auto-resolve destination library by MediaType (movies/tvshows) — no
      per-item prompt, no new plugin setting
- [x] Targeted `Folder.ValidateChildren` scan on completion — real
      Movie/Episode item, normal watched-tracking, no virtual item
- [x] Keep seeding after completion (default; no stop-seeding control yet)

**Exit:** Add to Library → Cache to library → downloads straight into a real
library folder → shows up under the normal library view, offline-capable,
without *arr/STRM. See [ADR-009](docs/adr/009-cache-to-library-v0.4.md).

### 0.4.1 — Stream correction + warm-progress/regression hotfix

"Stream" had shipped as a bare alias for the plain Play button (no library
trace at all) — corrected to what "Add to Library → Stream" actually means:
a real, permanent `.strm` pointer, strmarr-style. Also fixes a real
regression in the 0.2.1-era blazing-ahead mitigation: the post-tail+head
readahead window was sized in raw piece count and could balloon past a
gigabyte on large-piece-length torrents, making warm noticeably slower than
before that fix landed.

- [x] `POST stream-bind` writes a `.strm` pointer into the auto-resolved
      library folder (same resolution as `cache-bind`); content is the
      existing authenticated on-demand stream URL
- [x] Play/Lucky unchanged — still always bind a real growing-file virtual
      item, never a placeholder ([ADR-010](docs/adr/010-strm-add-to-library-v0.4.1.md))
- [x] Readahead window bounded in bytes (`kReadaheadFloorBytes`), not raw
      piece count — was the actual "slower than the former tag" regression
- [x] `swarm_status.progress` now reports warm-completion fraction
      (tail+head[+readahead] pieces on disk), not raw libtorrent torrent
      progress (whose denominator changes size mid-warm)
- [x] Client warm overlay polls that progress into a real bar instead of an
      indefinite spinner (wherever btih is known up front)

**Exit:** Add to Library → Stream leaves a real, permanent library item
behind; warming a fresh play shows real percentage progress and completes in
roughly the same time it did before the blazing-ahead fix landed.

### 0.5.0 — Discover pane (Seerr-shaped browse, JE chrome rolled in)

Living-room Discover home next to Enhanced Panel / Bookmarks. Reuses the
jellyseerr poster cards already rolled into this JE fork (Play / Lucky /
Library), backed by TMDB when Seerr is off. Attribution for JE chrome + MIT
seerr Discover patterns: [`ATTRIBUTION.md`](ATTRIBUTION.md).

- [x] Sidebar Discover pane + search landing link
- [x] Default Seerr slider order (trending / popular / genres / upcoming)
- [x] TMDB discover endpoints when Swarmplay discovery is on
- [x] Empty-pane + `#/discover` 404 fixes

**Exit:** Open Discover → see sliders → Play/Lucky/Library work like search.

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
- STRM / library stub trees as the **core Play/Lucky path** (O6b/O6c) —
  those always bind a real growing-file virtual item, never a placeholder.
  **Cache to library** is likewise real library Path, not STRM. The single,
  narrow, opt-in exception is **Add to Library → Stream**, which writes a
  real `.strm` pointer by explicit request ([ADR-010](docs/adr/010-strm-add-to-library-v0.4.1.md))
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
4. **0.3 Batch episode fanout**
5. **0.4 Cache-to-library** (Add to Library → Stream/Cache prompt)
6. (Later) O7b sidecar
```
