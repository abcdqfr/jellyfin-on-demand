# Third-party references

Product code lives in `plugin/Jellyfin.Plugin.Swarmplay/` (JE fork). License /
steal-log: [`../ATTRIBUTION.md`](../ATTRIBUTION.md).

| Directory | Upstream | Role |
|---|---|---|
| [`jellyfin-enhanced/`](jellyfin-enhanced/) | [n00bcodr/Jellyfin-Enhanced](https://github.com/n00bcodr/Jellyfin-Enhanced) | Pristine JE (GPL-3); working fork is under `plugin/` |
| [`vlc-bittorrent/`](vlc-bittorrent/) | [johang/vlc-bittorrent](https://github.com/johang/vlc-bittorrent) | In-process libtorrent session shape (GPL-3); fixtures |
| [`seerr/`](seerr/) | Seerr/Jellyseerr | Prior-art UI/API patterns only (MIT); not a runtime |
| [`strmarr/`](strmarr/) | Symlink → `../../strmarr` | **Lessons / lore only** (I10: no code import) |

## strmarr symlink vs services

- **Keep** the `third-party/strmarr` symlink so design notes and LESSONS can
  point at real sister-repo paths while developing Swarmplay.
- **Do not** run strmarr services (docker compose, `make`, HTTP media server,
  *arr stack) as part of Swarmplay. Swarmplay’s runtime is Jellyfin + this
  plugin + libtorrent only.

- **JE (plugin fork):** ship and modify Swarmplay there; `jellyfin-enhanced/` is for diff/upstream comparison.
- **vlc-bt:** session model + test torrents under `test/data/`.
- **seerr:** read-only patterns; ADR-004 forbids a Seerr fork as product half.
