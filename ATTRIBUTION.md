# Third-party attribution and license compliance

**Purpose:** Track every upstream we keep on disk or may copy patterns/code
from into jellyfin-on-demand. When we **steal** (copy or derive) code, follow the
license obligations below and record the take in the [Steal log](#steal-log).

**Product rule:** Seerr/Jellyseerr is **not** a runtime dependency and is
**not** forked as a second product ([ADR-004](docs/adr/004-one-product-no-seerr-fork.md)).
Discovery UX that originally talked to a Seerr process has been **rolled into
this Jellyfin on Demand fork** — same plugin, same GPL-3.0 shipping
surface under `plugin/Jellyfin.Plugin.JellyfinOnDemand/`. Seerr remains **reference
only** (local clone + occasional MIT pattern takes).

---

## On-disk references

| Tree | Upstream | License | Role |
|------|----------|---------|------|
| [`plugin/Jellyfin.Plugin.JellyfinOnDemand/`](plugin/Jellyfin.Plugin.JellyfinOnDemand/) | Fork of [n00bcodr/Jellyfin-Enhanced](https://github.com/n00bcodr/Jellyfin-Enhanced) → [abcdqfr/jellyfin-on-demand](https://github.com/abcdqfr/jellyfin-on-demand) | **GPL-3.0** | Product plugin (derivative work). Includes JE's former Seerr/Jellyseerr **client chrome** (`js/jellyseerr/*`, proxy controllers) **rolled in** and retargeted to JellyfinOnDemand/TMDB — no Seerr process. |
| [`third-party/jellyfin-enhanced/`](third-party/jellyfin-enhanced/) | [n00bcodr/Jellyfin-Enhanced](https://github.com/n00bcodr/Jellyfin-Enhanced) | **GPL-3.0** | Pristine upstream reference |
| [`third-party/seerr/`](third-party/seerr/) | [seerr-team/seerr](https://github.com/seerr-team/seerr) (MIT; copyright notice: © 2020 sct — Overseerr lineage; Seerr is the Jellyseerr successor tree we clone) | **MIT** | Discovery/request **patterns** for retarget into plugin; not a runtime dep |
| [`third-party/vlc-bittorrent/`](third-party/vlc-bittorrent/) | [johang/vlc-bittorrent](https://github.com/johang/vlc-bittorrent) | **GPL-3.0-or-later** (Johan Gunnarsson) | libtorrent in-process session lean (O7a) |
| [`third-party/strmarr/`](third-party/strmarr/) | Sister symlink → [`../../strmarr`](../../strmarr) | **MIT** | Lessons only (cache/seed lore); **no code import** (I10); **do not run** strmarr services |

License texts on disk:

- JE / fork: `plugin/Jellyfin.Plugin.JellyfinOnDemand/LICENSE`
- Seerr: `third-party/seerr/LICENSE`
- vlc-bittorrent: `third-party/vlc-bittorrent/COPYING` (GPL-3) + per-file headers
- strmarr: `third-party/strmarr/LICENSE` (via symlink)

---

## Jellyseerr / Seerr chrome inside this fork (rolled-in)

Upstream **Jellyfin on Demand** shipped a Seerr/Jellyseerr *integration*
(poster search chrome, request buttons, proxy routes under names like
`jellyseerr/*`). That code is part of the JE GPL-3.0 tree.

**In Jellyfin on Demand this chrome is rolled into the product plugin itself**, not
deleted and not left depending on a Seerr service:

| Layer | What shipped in JE | What Jellyfin on Demand does |
|-------|--------------------|---------------------|
| Client | `js/jellyseerr/*` search/modal/card UI | Kept; Play / Lucky / Library replace Request; Discover pane reuses the same cards |
| Server | Seerr HTTP proxy + settings | Prefer TMDB when `JellyfinOnDemandDiscoveryEnabled` (ADR-004); Seerr proxy only if an operator still enables it |
| Runtime | Expected a Seerr/Jellyseerr process | **Not required.** Discover + search work with TMDB alone |

Directory / API path names may still say `jellyseerr` for history and
compat — that is naming debt, not a Jellyseerr dependency.

**Attribution for that rolled-in chrome:** derivative of
[n00bcodr/Jellyfin-Enhanced](https://github.com/n00bcodr/Jellyfin-Enhanced)
under **GPL-3.0** (same LICENSE as this plugin). Additional **MIT** takes
from [seerr-team/seerr](https://github.com/seerr-team/seerr) (e.g. Discover
genre color map / slider order) are listed in the steal log below and must
retain the MIT notice.

---

## Compliance rules (what “steal” requires)

### GPL-3.0 sources (Jellyfin on Demand, vlc-bittorrent)

- Jellyfin on Demand plugin that **is** a JE fork remains **GPL-3.0**. Keep LICENSE;
  preserve copyright notices in modified files.
- Copying vlc-bt code into a GPL-3 plugin is license-compatible; keep
  authorship headers and GPL notice on those files.
- Distributing binaries/plugins ⇒ provide Corresponding Source (usual GPL).

### MIT sources (Seerr / Jellyseerr lineage)

- May copy into the GPL-3 plugin (MIT → GPL is allowed).
- **Must** retain the MIT copyright notice and permission notice in any
  substantial portion copied (e.g. file header and/or this ATTRIBUTION +
  steal log).
- Seerr NOTICE lineage: `Copyright (c) 2020 sct` in upstream `LICENSE`; also
  attribute **seerr-team/seerr** as the tree we cloned (Jellyseerr successor).

### Do not

- Drop LICENSE files from vendored/forked trees.
- Import Go/`internal` from any *arr/STRM sister product (I10) even if MIT
  would allow it legally — **lessons only**.
- Treat Seerr/Jellyseerr as a required runtime or second fork (ADR-004).
- Imply that Jellyfin on Demand “includes Jellyseerr the product” — it includes JE's
  **client chrome**, retargeted; it does **not** ship or require the Seerr
  server.

---

## Steal log

Record every non-trivial copy or close derivative. One row per take.

- Add a row when code or a close derivative is committed; do not log ideas or
  reference-only reading.
- **EXAMPLE — not a real take:** `2026-07-21 | seerr-team/seerr | plugin/.../Search.cs | MIT Seerr copy | MIT notice retained`
- **EXAMPLE — not a real take:** `2026-07-21 | johang/vlc-bittorrent | plugin/.../Session.cs | GPL vlc-bt header kept | GPL header retained`

| Date | From | Into | What | License obligation met how |
|------|------|------|------|----------------------------|
| (ongoing) | n00bcodr/Jellyfin-Enhanced (`js/jellyseerr/*`, Seerr proxy controllers) | `plugin/Jellyfin.Plugin.JellyfinOnDemand/...` (same paths, Jellyfin on Demand-retargeted) | JE Seerr/Jellyseerr **client chrome rolled into** this fork — search posters, cards, modals; Discover pane reuses cards; no Seerr process | GPL-3.0 — plugin LICENSE is JE fork LICENSE; copyright notices preserved in tree |
| 2026-07-22 | seerr-team/seerr (`src/components/Discover/constants.ts` genreColorMap/colorTones; Discover slider titles/order from `index.tsx`) | `plugin/.../js/swarm/discover-page.js` | Discover pane genre-card tones + default slider order (Trending / Popular Movies / Movie Genres / Upcoming Movies / Popular Series / Series Genres / Upcoming Series) | MIT — copyright © 2020 sct / seerr-team retained via this steal-log row + `third-party/seerr/LICENSE`; file header cites source |

When you copy: add a row, keep upstream copyright in the new file header, and
point here if the take is multi-file.

---

## Clone notes (bandwidth)

- `third-party/seerr/`: shallow clone (`--depth 1 --single-branch develop`) via
  `gh repo clone seerr-team/seerr`. On-disk ~**18 MiB** (2026-07-21). GitHub
  `size` field was ~57 MiB; allotment was 500 MiB.
- Do not `pnpm install` / build Seerr on cellular — source read-only is enough
  for unification reading.
