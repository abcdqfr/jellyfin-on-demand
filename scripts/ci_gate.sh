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
# Growing files on btrfs lab cache — never tmpfs /tmp.
export SWARMPLAY_CACHE_DIR="${SWARMPLAY_CACHE_DIR:-/home/brandon/cache/swarmplay}"
mkdir -p "$SWARMPLAY_CACHE_DIR"

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

printf '== mkv probe unit tests ==\n'
# ADR-007: pure EBML/Matroska probe tests — no libtorrent, no session. Build
# (in case mkv_probe.{h,cpp}/mkv_probe_test.cpp changed) then run.
cmake --build "$root/torrent/native/build" --target mkv_probe_test -j"$(nproc)" \
  || die "mkv_probe_test build failed"
"$root/torrent/native/build/mkv_probe_test" || die "mkv_probe_test failed"

printf '== native local-seed smoke ==\n'
python3 "$root/scripts/native_ensure_local_seed_smoke.py"

printf '== JF play-bind integration smoke ==\n'
# Prefer system Jellyfin on the lab host (real disk cache + plugin). Fall back to
# ephemeral user-scoped JF only when the system instance is down.
if curl -sf -m 3 "${JF_URL:-http://127.0.0.1:8096}/System/Info/Public" >/dev/null \
  && [[ -n "${JF_USER:-}" && -n "${JF_PASS:-}" ]]; then
  python3 "$root/scripts/jf_system_smoke.py"
elif curl -sf -m 3 "${JF_URL:-http://127.0.0.1:8096}/System/Info/Public" >/dev/null; then
  JF_USER="${JF_USER:-jellyfin}" JF_PASS="${JF_PASS:-jellyfin}" \
    python3 "$root/scripts/jf_system_smoke.py"
else
  python3 "$root/scripts/jf_ensure_local_smoke.py"
fi

# When system JF is up (lab host), also prove public-config / route rename.
# Unreachable JF → skip inside the script (temp JF smoke above still required).
printf '== live public-config / route smoke ==\n'
python3 "$root/scripts/live_public_config_smoke.py"

printf '== history API smoke ==\n'
if curl -sf -m 3 "${JF_URL:-http://127.0.0.1:8096}/System/Info/Public" >/dev/null; then
  JF_USER="${JF_USER:-jellyfin}" JF_PASS="${JF_PASS:-jellyfin}" \
    python3 "$root/scripts/jf_history_smoke.py"
else
  printf 'skip history smoke (JF not reachable)\n'
fi

printf 'CI_GATE PASS\n'
