#!/usr/bin/env bash
# Build jf10 plugin + stage native .so into dist/jellyfin-on-demand-<ver>/
set -euo pipefail

ver="${1:-0.1.0}"
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

export PATH="$root/.tools/dotnet:${PATH:-}"
export DOTNET_ROOT="$root/.tools/dotnet"
export DOTNET_CLI_HOME="$root/.tools/dotnet-cli-home"
export NUGET_PACKAGES="$root/.tools/nuget"
export DOTNET_NOLOGO=1 DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1 DOTNET_CLI_TELEMETRY_OPTOUT=1

so="$root/torrent/native/build/libjellyfin_on_demand_native.so"
[[ -f "$so" ]] || { echo "missing $so — build torrent/native first" >&2; exit 1; }

dotnet build "$root/plugin/Jellyfin.Plugin.JellyfinOnDemand/Jellyfin.Plugin.JellyfinOnDemand/JellyfinOnDemand.csproj" \
  -p:JellyfinTarget=jf10 -c Release -v q

dll="$root/plugin/Jellyfin.Plugin.JellyfinOnDemand/Jellyfin.Plugin.JellyfinOnDemand/bin/Release/net9.0/Jellyfin.Plugin.JellyfinOnDemand.dll"
[[ -f "$dll" ]] || dll="$root/plugin/Jellyfin.Plugin.JellyfinOnDemand/Jellyfin.Plugin.JellyfinOnDemand/bin/Debug/net9.0/Jellyfin.Plugin.JellyfinOnDemand.dll"
[[ -f "$dll" ]] || { echo "missing plugin DLL" >&2; exit 1; }

out="$root/dist/jellyfin-on-demand-${ver}"
rm -rf "$out"
mkdir -p "$out/Jellyfin.Plugin.JellyfinOnDemand"

cp -f "$dll" "$out/Jellyfin.Plugin.JellyfinOnDemand/Jellyfin.Plugin.JellyfinOnDemand.dll"
cp -f "$so" "$out/libjellyfin_on_demand_native.so"

# Four-part assembly version for JF meta
assy="${ver}.0"
case "$ver" in
  *.*.*.*) assy="$ver" ;;
  *.*.*) assy="${ver}.0" ;;
esac

cat > "$out/Jellyfin.Plugin.JellyfinOnDemand/meta.json" <<META
{
  "guid": "935a72b9-7639-473b-bb54-4259f7a9695c",
  "name": "Jellyfin on Demand",
  "description": "On-demand discovery and playback for Jellyfin (JE-derived)",
  "overview": "magnet/Torznab → libtorrent → growing file → Play",
  "owner": "jellyfin-on-demand",
  "category": "General",
  "version": "${assy}",
  "targetAbi": "10.11.0.0",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%S.0000000Z)",
  "autoUpdate": false
}
META

cat > "$out/README-INSTALL.txt" <<INST
JellyfinOnDemand ${ver}
1. Copy Jellyfin.Plugin.JellyfinOnDemand/ into Jellyfin plugins directory.
2. Export LD_LIBRARY_PATH to include this directory (for libjellyfin_on_demand_native.so).
3. Restart Jellyfin; connect Jellyfin Desktop to that server.
See docs/releases/${ver}.md
INST

# zip for handoff
(
  cd "$root/dist"
  rm -f "jellyfin-on-demand-${ver}.zip"
  zip -qr "jellyfin-on-demand-${ver}.zip" "jellyfin-on-demand-${ver}"
)

echo "PACKAGED $out"
echo "ZIP      $root/dist/jellyfin-on-demand-${ver}.zip"
