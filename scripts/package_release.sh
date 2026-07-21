#!/usr/bin/env bash
# Build jf10 plugin + stage native .so into dist/swarmplay-<ver>/
set -euo pipefail

ver="${1:-0.1.0}"
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

export PATH="$root/.tools/dotnet:${PATH:-}"
export DOTNET_ROOT="$root/.tools/dotnet"
export DOTNET_CLI_HOME="$root/.tools/dotnet-cli-home"
export NUGET_PACKAGES="$root/.tools/nuget"
export DOTNET_NOLOGO=1 DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1 DOTNET_CLI_TELEMETRY_OPTOUT=1

so="$root/torrent/native/build/libswarmplay_native.so"
[[ -f "$so" ]] || { echo "missing $so — build torrent/native first" >&2; exit 1; }

dotnet build "$root/plugin/Jellyfin.Plugin.Swarmplay/Jellyfin.Plugin.Swarmplay/Swarmplay.csproj" \
  -p:JellyfinTarget=jf10 -c Release -v q

dll="$root/plugin/Jellyfin.Plugin.Swarmplay/Jellyfin.Plugin.Swarmplay/bin/Release/net9.0/Jellyfin.Plugin.Swarmplay.dll"
[[ -f "$dll" ]] || dll="$root/plugin/Jellyfin.Plugin.Swarmplay/Jellyfin.Plugin.Swarmplay/bin/Debug/net9.0/Jellyfin.Plugin.Swarmplay.dll"
[[ -f "$dll" ]] || { echo "missing plugin DLL" >&2; exit 1; }

out="$root/dist/swarmplay-${ver}"
rm -rf "$out"
mkdir -p "$out/Jellyfin.Plugin.Swarmplay"

cp -f "$dll" "$out/Jellyfin.Plugin.Swarmplay/Jellyfin.Plugin.Swarmplay.dll"
cp -f "$so" "$out/libswarmplay_native.so"

# Four-part assembly version for JF meta
assy="${ver}.0"
case "$ver" in
  *.*.*.*) assy="$ver" ;;
  *.*.*) assy="${ver}.0" ;;
esac

cat > "$out/Jellyfin.Plugin.Swarmplay/meta.json" <<META
{
  "guid": "f69e946a-4b3c-4e9a-8f0a-8d7c1b2c4d9b",
  "name": "Swarmplay",
  "description": "BitTorrent play path for Jellyfin (JE fork)",
  "overview": "magnet/Torznab → libtorrent → growing file → Play",
  "owner": "swarmplay",
  "category": "General",
  "version": "${assy}",
  "targetAbi": "10.11.0.0",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%S.0000000Z)",
  "autoUpdate": false
}
META

cat > "$out/README-INSTALL.txt" <<INST
Swarmplay ${ver}
1. Copy Jellyfin.Plugin.Swarmplay/ into Jellyfin plugins directory.
2. Export LD_LIBRARY_PATH to include this directory (for libswarmplay_native.so).
3. Restart Jellyfin; connect Jellyfin Desktop to that server.
See docs/releases/${ver}.md
INST

# zip for handoff
(
  cd "$root/dist"
  rm -f "swarmplay-${ver}.zip"
  zip -qr "swarmplay-${ver}.zip" "swarmplay-${ver}"
)

echo "PACKAGED $out"
echo "ZIP      $root/dist/swarmplay-${ver}.zip"
