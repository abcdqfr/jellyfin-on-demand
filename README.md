# Jellyfin on Demand

On-demand discovery and playback for Jellyfin: living-room pane →
magnet/Torznab → in-process libtorrent → tail→head warm → growing file on a
**virtual item** → Play.

Independent community project — **not affiliated** with Jellyfin, Jellyfin
Enhanced, or Seerr. Code ancestry: fork of Jellyfin Enhanced
([ADR-011](docs/adr/011-product-identity.md)).

No *arr. No Seerr/Jellyseerr **runtime**. No Go/anacrolix engine.
(JE's former Seerr *client chrome* is rolled into this plugin and retargeted —
see [`ATTRIBUTION.md`](ATTRIBUTION.md).)

Public repo: [abcdqfr/jellyfin-on-demand](https://github.com/abcdqfr/jellyfin-on-demand).

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
jellyfin-on-demand/
  plugin/Jellyfin.Plugin.JellyfinOnDemand/   JE fork (product plugin)
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
dotnet build plugin/Jellyfin.Plugin.JellyfinOnDemand/Jellyfin.Plugin.JellyfinOnDemand/JellyfinOnDemand.csproj -p:JellyfinTarget=jf10
```

## Sister tree (strmarr)

- Symlink: `third-party/strmarr` → `../../strmarr` for lessons and path reference.
- **Do not** start strmarr docker/`make`/HTTP services for Jellyfin on Demand work.
- Runtime: Jellyfin + Jellyfin on Demand plugin + libtorrent. Client: **Jellyfin Desktop**.

## Remotes

This repo has **no** public GitHub `origin`. Do not add one casually — accidental
push to a public fork is worse than a missing remote. Nested plugin remotes were
removed for the same reason.

## Release (local)

```sh
./scripts/package_release.sh 0.1.0
# tag: v0.1.0 — see docs/releases/0.1.0.md
```

## Lab host

```sh
make help
make up       # deploy 0.1.0 to system Jellyfin on this machine
make status
```
