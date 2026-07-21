#!/usr/bin/env bash
# Local integration gate: must pass before commit (ADR-005).
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

export PATH="$root/.tools/dotnet:${PATH:-}"
export DOTNET_ROOT="$root/.tools/dotnet"
export DOTNET_CLI_HOME="$root/.tools/dotnet-cli-home"
export NUGET_PACKAGES="$root/.tools/nuget"
export DOTNET_NOLOGO=1
export DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1
export DOTNET_CLI_TELEMETRY_OPTOUT=1
export LD_LIBRARY_PATH="$root/torrent/native/build:${LD_LIBRARY_PATH:-}"

die() { printf 'CI_GATE FAIL: %s\n' "$*" >&2; exit 1; }

command -v python3 >/dev/null || die "python3 required"
command -v node >/dev/null || die "node required"
command -v dotnet >/dev/null || die "dotnet required (install under .tools/dotnet)"
command -v jellyfin >/dev/null || die "jellyfin required for integration smoke"
test -x /usr/lib/jellyfin-ffmpeg/ffprobe || die "jellyfin-ffmpeg ffprobe required"
pkg-config --exists libtorrent-rasterbar || die "libtorrent-rasterbar-dev required"

printf '== offline checks ==\n'
"$root/scripts/offline_check.sh"

printf '== plugin build (jf10) ==\n'
dotnet build "$root/plugin/Jellyfin.Plugin.Swarmplay/Jellyfin.Plugin.Swarmplay/Swarmplay.csproj" \
  -p:JellyfinTarget=jf10 -v q

printf '== native library ==\n'
so="$root/torrent/native/build/libswarmplay_native.so"
if [[ ! -f "$so" ]]; then
  die "missing $so — build torrent/native first"
fi

printf '== native local-seed smoke ==\n'
python3 "$root/scripts/native_ensure_local_seed_smoke.py"

printf '== JF play-bind integration smoke ==\n'
python3 "$root/scripts/jf_ensure_local_smoke.py"

printf 'CI_GATE PASS\n'
