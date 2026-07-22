#!/usr/bin/env bash
# Deploy JellyfinOnDemand plugin + native lib into system Jellyfin on this host.
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SUDO="${SUDO:-sudo}"
JF_PLUGIN_DIR="${JF_PLUGIN_DIR:-/var/lib/jellyfin/plugins/Jellyfin.Plugin.JellyfinOnDemand}"
JF_NATIVE_LIB="${JF_NATIVE_LIB:-/usr/local/lib/libjellyfin_on_demand_native.so}"
# Real disk (lab btrfs under /home/brandon) — never tmpfs /tmp.
JELLYFIN_ON_DEMAND_CACHE_DIR="${JELLYFIN_ON_DEMAND_CACHE_DIR:-/home/brandon/cache/jellyfin-on-demand}"
DROPIN_DIR=/etc/systemd/system/jellyfin.service.d
DROPIN="${DROPIN_DIR}/jellyfin-on-demand.conf"

die() { printf 'deploy: %s\n' "$*" >&2; exit 1; }

if [[ "${1:-}" == "--uninstall" ]]; then
  "$SUDO" systemctl stop jellyfin.service 2>/dev/null || true
  "$SUDO" rm -rf "$JF_PLUGIN_DIR"
  "$SUDO" rm -f "$JF_NATIVE_LIB"
  "$SUDO" rm -f "$DROPIN"
  "$SUDO" ldconfig
  "$SUDO" systemctl daemon-reload
  echo "deploy: uninstalled JellyfinOnDemand from system Jellyfin"
  exit 0
fi

ver="${1:-0.1.0}"
dist="$root/dist/jellyfin-on-demand-${ver}"
[[ -d "$dist/Jellyfin.Plugin.JellyfinOnDemand" ]] || die "missing $dist — run: make package VERSION=$ver"
[[ -f "$dist/libjellyfin_on_demand_native.so" ]] || die "missing native in $dist"

# Refuse tmpfs roots — growing files must live on disk (btrfs here).
case "$JELLYFIN_ON_DEMAND_CACHE_DIR" in
  /tmp|/tmp/*|/dev/shm|/dev/shm/*)
    die "JELLYFIN_ON_DEMAND_CACHE_DIR=$JELLYFIN_ON_DEMAND_CACHE_DIR is tmpfs; use disk e.g. /home/brandon/cache/jellyfin-on-demand"
    ;;
esac

echo "deploy: plugin → $JF_PLUGIN_DIR"
"$SUDO" install -d -o jellyfin -g jellyfin -m 0755 "$JF_PLUGIN_DIR"
"$SUDO" install -o jellyfin -g jellyfin -m 0644 \
  "$dist/Jellyfin.Plugin.JellyfinOnDemand/Jellyfin.Plugin.JellyfinOnDemand.dll" \
  "$JF_PLUGIN_DIR/Jellyfin.Plugin.JellyfinOnDemand.dll"
"$SUDO" install -o jellyfin -g jellyfin -m 0644 \
  "$dist/Jellyfin.Plugin.JellyfinOnDemand/meta.json" \
  "$JF_PLUGIN_DIR/meta.json"

echo "deploy: native → $JF_NATIVE_LIB"
"$SUDO" install -m 0755 "$dist/libjellyfin_on_demand_native.so" "$JF_NATIVE_LIB"
"$SUDO" ldconfig

# Sibling of strmarr/arr under brandon:jellyfin setgid cache tree on btrfs.
echo "deploy: swarm cache → $JELLYFIN_ON_DEMAND_CACHE_DIR (disk)"
"$SUDO" mkdir -p "$JELLYFIN_ON_DEMAND_CACHE_DIR"
"$SUDO" chown jellyfin:jellyfin "$JELLYFIN_ON_DEMAND_CACHE_DIR"
"$SUDO" chmod 2775 "$JELLYFIN_ON_DEMAND_CACHE_DIR"

echo "deploy: systemd drop-in $DROPIN"
"$SUDO" install -d -m 0755 "$DROPIN_DIR"
"$SUDO" tee "$DROPIN" >/dev/null <<UNIT
# Managed by jellyfin-on-demand scripts/deploy_local.sh — libtorrent native for Ensure/play-bind
[Service]
Environment=LD_LIBRARY_PATH=/usr/local/lib
Environment=JELLYFIN_ON_DEMAND_CACHE_DIR=$JELLYFIN_ON_DEMAND_CACHE_DIR
UNIT
"$SUDO" systemctl daemon-reload

if systemctl is-active --quiet jellyfin.service; then
  echo "deploy: restarting jellyfin"
  "$SUDO" systemctl restart jellyfin.service
else
  echo "deploy: jellyfin inactive (make start / make up)"
fi

echo "deploy: ok ($ver)"
