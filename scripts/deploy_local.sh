#!/usr/bin/env bash
# Deploy Swarmplay plugin + native lib into system Jellyfin on this host.
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SUDO="${SUDO:-sudo}"
JF_PLUGIN_DIR="${JF_PLUGIN_DIR:-/var/lib/jellyfin/plugins/Jellyfin.Plugin.Swarmplay}"
JF_NATIVE_LIB="${JF_NATIVE_LIB:-/usr/local/lib/libswarmplay_native.so}"
DROPIN_DIR=/etc/systemd/system/jellyfin.service.d
DROPIN="${DROPIN_DIR}/swarmplay.conf"

die() { printf 'deploy: %s\n' "$*" >&2; exit 1; }

if [[ "${1:-}" == "--uninstall" ]]; then
  "$SUDO" systemctl stop jellyfin.service 2>/dev/null || true
  "$SUDO" rm -rf "$JF_PLUGIN_DIR"
  "$SUDO" rm -f "$JF_NATIVE_LIB"
  "$SUDO" rm -f "$DROPIN"
  "$SUDO" ldconfig
  "$SUDO" systemctl daemon-reload
  echo "deploy: uninstalled Swarmplay from system Jellyfin"
  exit 0
fi

ver="${1:-0.1.0}"
dist="$root/dist/swarmplay-${ver}"
[[ -d "$dist/Jellyfin.Plugin.Swarmplay" ]] || die "missing $dist — run: make package VERSION=$ver"
[[ -f "$dist/libswarmplay_native.so" ]] || die "missing native in $dist"

echo "deploy: plugin → $JF_PLUGIN_DIR"
"$SUDO" install -d -o jellyfin -g jellyfin -m 0755 "$JF_PLUGIN_DIR"
"$SUDO" install -o jellyfin -g jellyfin -m 0644 \
  "$dist/Jellyfin.Plugin.Swarmplay/Jellyfin.Plugin.Swarmplay.dll" \
  "$JF_PLUGIN_DIR/Jellyfin.Plugin.Swarmplay.dll"
"$SUDO" install -o jellyfin -g jellyfin -m 0644 \
  "$dist/Jellyfin.Plugin.Swarmplay/meta.json" \
  "$JF_PLUGIN_DIR/meta.json"

echo "deploy: native → $JF_NATIVE_LIB"
"$SUDO" install -m 0755 "$dist/libswarmplay_native.so" "$JF_NATIVE_LIB"
"$SUDO" ldconfig

echo "deploy: systemd drop-in $DROPIN"
"$SUDO" install -d -m 0755 "$DROPIN_DIR"
"$SUDO" tee "$DROPIN" >/dev/null <<UNIT
# Managed by swarmplay scripts/deploy_local.sh — libtorrent native for Ensure/play-bind
[Service]
Environment=LD_LIBRARY_PATH=/usr/local/lib
UNIT
"$SUDO" systemctl daemon-reload

if systemctl is-active --quiet jellyfin.service; then
  echo "deploy: restarting jellyfin"
  "$SUDO" systemctl restart jellyfin.service
else
  echo "deploy: jellyfin inactive (make start / make up)"
fi

echo "deploy: ok ($ver)"
