# Invariants and options

**Invariants** are non-negotiable. **Options** are choices — locked picks are in
the [decision log](#decision-log); open rows stay TBD until portrayed in JF.

---

## Invariants

| # | Invariant | Meaning |
|---|-----------|---------|
| I1 | **btih is identity** | Media play binding is `infohash` (+ `file_index` when multi-file). Not path cosplay, not *arr history rows. |
| I2 | **Sequential bytes** | After warm-lite, swarm download priority is sequential (play-head forward). Random piece rarefaction is a bug. |
| I3 | **Jellyfin is the player** | Delivery ends in a growing file path JF can open for ffprobe/ffmpeg. |
| I4 | **Pane in Jellyfin** | Browse / search / pick / play live in JF. **One product:** JE fork → Jellyfin on Demand plugin (O4b). No Seerr fork / no second living-room app (ADR-004). |
| I5 | **No STRM** | Do not write `.strm` pointers or maintain a virtual library tree for this product. |
| I6 | **No strmarr media HTTP** | Do not reintroduce `/v1/stream/slot|btih/...` as the spine. |
| I7 | **No *arr required** | Sonarr/Radarr/Prowlarr/Seerr are out of MVP. |
| I8 | **libtorrent, not Go engine** | System **libtorrent-rasterbar** class stack only. No `engine/` / anacrolix import. |
| I9 | **Warm lite: tail then head** | Before Play returns: prioritize **tail M MiB, then head N MiB**, then sequential. Tail-first reduces seek-head thrash (swarm cursor jumps less than head-then-tail). Operator thesis: ~last 5% then ~first 5% is enough extents for probe/play, then grow sequential. Fail-open if warm times out. Not a SubGate/PSR product. |
| I10 | **Spinoff-clean** | No code import from sister `internal/`/`engine/`. Symlink at `third-party/strmarr` for lore is OK; **do not run** sister services. |
| I11 | **Ranked pick list** | Torznab/magnet results shown in JF are **strongly sorted** so the best match is first; users skim and choose, usually without scrolling. Selecting an option starts that swarm; best-by-default means Play can take #1 without hunting. |

---

## Options

### O1 — Torrent engine — **LOCKED O1a**

| ID | Choice | Status |
|----|--------|--------|
| **O1a** | **libtorrent-rasterbar** | **Locked** |
| O1b | Existing daemon API | rejected for MVP |
| O1c | webtorrent / Node | rejected |

### O2 — How Jellyfin reads bytes — **LOCKED O2a**

| ID | Choice | Status |
|----|--------|--------|
| **O2a** | **Growing incomplete file**; JF `Path` = that file | **Locked** |
| O2b | Tiny localhost range bridge | fallback only if O2a fails in practice |
| O2c | Custom PathProvider | later if needed |

### O3 — Extent warm lite — **LOCKED O3c + order**

| ID | Choice | Status |
|----|--------|--------|
| O3a | None | rejected |
| O3b | Head only | rejected |
| **O3c** | **Tail M + head N MiB**, order **tail → head → sequential** | **Locked** (see I9) |

Default floors: start in the ~8+8 MiB class; tune with evidence, not lore.

### O4 — JE / plugin wiring — **LOCKED O4b (fork JE)**

| ID | Choice | Status |
|----|--------|--------|
| O4a | New companion from scratch; study JE | superseded |
| **O4b** | **Fork Jellyfin on Demand** → gut Seerr/*arr; keep pane/proxy/settings/discovery chrome | **Locked** |
| O4c | JE config → external helper URL only | not the product spine |

JE fork is the product shell. **Do not fork Seerr** — retarget discovery/request
chrome to Torznab/magnet/`Ensure` inside this plugin ([ADR-004](docs/adr/004-one-product-no-seerr-fork.md)).
Pristine upstream reference stays in [`third-party/jellyfin-enhanced/`](third-party/jellyfin-enhanced/).
Working tree: [`plugin/Jellyfin.Plugin.JellyfinOnDemand/`](plugin/Jellyfin.Plugin.JellyfinOnDemand/).

### O5 — Release discovery — **LOCKED O5a + O5b (Nyaa + TPB)**

| ID | Choice | Status |
|----|--------|--------|
| **O5a** | Paste magnet / btih | **Locked** (always available) |
| **O5b** | Torznab indexers — **Nyaa + The Pirate Bay** first | **Locked** for browse |
| O5c | Seerr/*arr hooks | out of MVP |

**UX (I11):**

1. User is on a title (TMDB/TVDB-backed pane — see O6).
2. Plugin searches configured Torznab endpoints (Nyaa, TPB; more later if boring).
3. Results render **in Jellyfin** as a short ranked list (score: resolution, source
   group, seeders, size, language/subs heuristics — strong defaults, best first).
4. User skims; usually picks without scrolling. Tap → that btih plays.
5. Optional: one-click Play uses **rank #1** when the user trusts defaults.

Magnet paste remains the escape hatch when Torznab is wrong or empty.

### O6 — Item / library model — **LOCKED O6a**

MVP path: TMDB/TVDB → title → ranked search → magnet → warm → Play on a
**plugin-owned virtual item** (optional “I’m feeling lucky” = rank #1, skip
picker). Abandon JF library scanner identity for this product.

| ID | Choice | Status |
|----|--------|--------|
| **O6a** | **Virtual items** (plugin-owned; no FS library row) | **Locked** |
| O6b | Placeholder stub files on disk | rejected for MVP |
| O6c | Play-time Path replace on an existing JF item | rejected for MVP |

Virtual ≠ “no Path”: at Play, the virtual item’s media source Path is the
growing file from O2a. See [`docs/adr/002-o6-o7.md`](docs/adr/002-o6-o7.md).

### O7 — Process boundary — **LOCKED O7a (MVP); O7b roadmap**

Follow [vlc-bittorrent](https://github.com/johang/vlc-bittorrent): in-player
process modules + shared `lt::session` singleton — **not** a sidecar for MVP.

| ID | Choice | Status |
|----|--------|--------|
| **O7a** | **In-JF + native libtorrent** (shared session; VLC-shaped) | **Locked (MVP)** |
| O7b | Sidecar `jellyfin-on-demandd` | **Roadmap** (post-MVP); re-derive session/seed/cache from LESSONS |
| O7c | Exec system tools per play | rejected as lean (not how vlc-bt works) |

---

## Decision log

| Option | Pick | Date | Notes |
|--------|------|------|-------|
| O1 engine | **O1a** libtorrent | 2026-07-20 | |
| O2 JF bytes | **O2a** growing file | 2026-07-20 | O2b only if seek/EOF breaks JF |
| O3 warm lite | **O3c** tail→head→seq | 2026-07-20 | I9: warm **tail then head** (seek-head thrash) |
| O4 plugin | **O4b** fork JE → Jellyfin on Demand | 2026-07-20 | Gut Seerr/*arr; see ROADMAP |
| O5 discovery | **O5a + O5b** magnet + Torznab (Nyaa, TPB) | 2026-07-20 | I11 ranked list in JF; best first |
| O6 library | **O6a** virtual items | 2026-07-20 | Pane-owned; Path = growing file at Play |
| O7 process | **O7a** in-JF (MVP); O7b roadmap | 2026-07-20 | Follow vlc-bt; see ADR-002 |

**Locked pack:** O1a + O2a + O3c(tail→head) + O4b + O5a/b + O6a + O7a(MVP).
**Roadmap:** O7b sidecar (not MVP).
