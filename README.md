# swarmplay

Living-room Jellyfin pane → magnet/Torznab → in-process libtorrent →
tail→head warm → growing file on a **virtual item** → Play.

No *arr. No `.strm`. No Seerr runtime. No Go/anacrolix engine.

**Status:** active product tree. Local integration is the commit gate
([ADR-005](docs/adr/005-local-integration-commit-gate.md)).

## Docs

| Doc | Role |
|-----|------|
| [`PRODUCT.md`](PRODUCT.md) | MVP definition |
| [`INVARIANTS.md`](INVARIANTS.md) | Non-negotiables + locked options |
| [`ROADMAP.md`](ROADMAP.md) | Phases |
| [`DELEGATION.md`](DELEGATION.md) | Job map |
| [`TRAVEL.md`](TRAVEL.md) | Bandwidth / offline notes |
| [`LESSONS.md`](LESSONS.md) | Scar tissue (lore only) |
| [`ATTRIBUTION.md`](ATTRIBUTION.md) | Licenses + steal log |
| [`docs/adr/`](docs/adr/) | Decisions |

## Layout

```text
swarmplay/
  plugin/Jellyfin.Plugin.Swarmplay/   JE fork (product plugin)
  torrent/native/                     libtorrent Ensure ABI
  scripts/                            offline checks + ci_gate + smokes
  docs/                               ADRs + design
  third-party/                        JE / vlc-bt / seerr + strmarr symlink (lore)
```

## Local gate (required to commit)

```sh
./scripts/ci_gate.sh
```

The git `pre-commit` hook runs the same script. It builds the JF10 plugin,
runs offline checks, native local-seed Ensure, then a user-scoped Jellyfin
`play-bind` smoke (ready Path + Jellyfin `ffprobe`).

Needs: Jellyfin 10.11, `jellyfin-web`, `jellyfin-ffmpeg`,
`libtorrent-rasterbar-dev`, repo `.tools/dotnet` (or SDK 9 on `PATH`).

## Build (plugin)

```sh
export PATH="$PWD/.tools/dotnet:$PATH"
export DOTNET_ROOT="$PWD/.tools/dotnet"
export DOTNET_CLI_HOME="$PWD/.tools/dotnet-cli-home"
export NUGET_PACKAGES="$PWD/.tools/nuget"
dotnet build plugin/Jellyfin.Plugin.Swarmplay/Jellyfin.Plugin.Swarmplay/Swarmplay.csproj -p:JellyfinTarget=jf10
```

## Sister tree (strmarr)

- Symlink: `third-party/strmarr` → `../../strmarr` for lessons and path reference.
- **Do not** start strmarr docker/`make`/HTTP services for Swarmplay work.
- Runtime: Jellyfin + Swarmplay plugin + libtorrent. Client: **Jellyfin Desktop**.

## Remotes

This repo has **no** public GitHub `origin`. Do not add one casually — accidental
push to a public fork is worse than a missing remote. Nested plugin remotes were
removed for the same reason.
