# Third-party attribution and license compliance

**Purpose:** Track every upstream we keep on disk or may copy patterns/code
from into swarmplay. When we **steal** (copy or derive) code, follow the
license obligations below and record the take in the [Steal log](#steal-log).

**Product rule:** Seerr is **reference only** for unification (discovery UX,
TMDB/server patterns). We do **not** run or fork Seerr as a second product
([ADR-004](docs/adr/004-one-product-no-seerr-fork.md)). The shipping surface is
the JE fork under `plugin/Jellyfin.Plugin.Swarmplay/` (GPL-3.0).

---

## On-disk references

| Tree | Upstream | License | Role |
|------|----------|---------|------|
| [`plugin/Jellyfin.Plugin.Swarmplay/`](plugin/Jellyfin.Plugin.Swarmplay/) | Fork of [n00bcodr/Jellyfin-Enhanced](https://github.com/n00bcodr/Jellyfin-Enhanced) → [abcdqfr/Jellyfin.Plugin.Swarmplay](https://github.com/abcdqfr/Jellyfin.Plugin.Swarmplay) | **GPL-3.0** | Product plugin (derivative work) |
| [`third-party/jellyfin-enhanced/`](third-party/jellyfin-enhanced/) | [n00bcodr/Jellyfin-Enhanced](https://github.com/n00bcodr/Jellyfin-Enhanced) | **GPL-3.0** | Pristine upstream reference |
| [`third-party/seerr/`](third-party/seerr/) | [seerr-team/seerr](https://github.com/seerr-team/seerr) (MIT; copyright notice: © 2020 sct — Overseerr lineage) | **MIT** | Discovery/request **patterns** for retarget into plugin; not a runtime dep |
| [`third-party/vlc-bittorrent/`](third-party/vlc-bittorrent/) | [johang/vlc-bittorrent](https://github.com/johang/vlc-bittorrent) | **GPL-3.0-or-later** (Johan Gunnarsson) | libtorrent in-process session lean (O7a) |
| [`third-party/strmarr/`](third-party/strmarr/) | Sister symlink → [`../../strmarr`](../../strmarr) | **MIT** | Lessons only (cache/seed lore); **no code import** (I10); **do not run** strmarr services |

License texts on disk:

- JE / fork: `plugin/Jellyfin.Plugin.Swarmplay/LICENSE`
- Seerr: `third-party/seerr/LICENSE`
- vlc-bittorrent: `third-party/vlc-bittorrent/COPYING` (GPL-3) + per-file headers
- strmarr: `third-party/strmarr/LICENSE` (via symlink)

---

## Compliance rules (what “steal” requires)

### GPL-3.0 sources (Jellyfin Enhanced, vlc-bittorrent)

- Swarmplay plugin that **is** a JE fork remains **GPL-3.0**. Keep LICENSE;
  preserve copyright notices in modified files.
- Copying vlc-bt code into a GPL-3 plugin is license-compatible; keep
  authorship headers and GPL notice on those files.
- Distributing binaries/plugins ⇒ provide Corresponding Source (usual GPL).

### MIT sources (Seerr)

- May copy into the GPL-3 plugin (MIT → GPL is allowed).
- **Must** retain the MIT copyright notice and permission notice in any
  substantial portion copied (e.g. file header and/or this ATTRIBUTION +
  steal log).
- Seerr NOTICE lineage: `Copyright (c) 2020 sct` in upstream `LICENSE`; also
  attribute **seerr-team/seerr** as the tree we cloned.

### Do not

- Drop LICENSE files from vendored/forked trees.
- Import Go/`internal` from any *arr/STRM sister product (I10) even if MIT
  would allow it legally — **lessons only**.
- Treat Seerr as a required runtime or second fork (ADR-004).

---

## Steal log

Record every non-trivial copy or close derivative. One row per take.

- Add a row when code or a close derivative is committed; do not log ideas or
  reference-only reading.
- **EXAMPLE — not a real take:** `2026-07-21 | seerr-team/seerr | plugin/.../Search.cs | MIT Seerr copy | MIT notice retained`
- **EXAMPLE — not a real take:** `2026-07-21 | johang/vlc-bittorrent | plugin/.../Session.cs | GPL vlc-bt header kept | GPL header retained`

| Date | From | Into | What | License obligation met how |
|------|------|------|------|----------------------------|
| _none yet_ | | | | |

When you copy: add a row, keep upstream copyright in the new file header, and
point here if the take is multi-file.

---

## Clone notes (bandwidth)

- `third-party/seerr/`: shallow clone (`--depth 1 --single-branch develop`) via
  `gh repo clone seerr-team/seerr`. On-disk ~**18 MiB** (2026-07-21). GitHub
  `size` field was ~57 MiB; allotment was 500 MiB.
- Do not `pnpm install` / build Seerr on cellular — source read-only is enough
  for unification reading.
