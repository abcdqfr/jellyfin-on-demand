#!/usr/bin/env bash
# Verify system Jellyfin loaded JellyfinOnDemand and can resolve native.
set -euo pipefail

JF_URL="${JF_URL:-http://127.0.0.1:8096}"
deadline=$((SECONDS + 120))

die() { printf 'verify: %s\n' "$*" >&2; exit 1; }

echo "verify: waiting for $JF_URL ..."
while (( SECONDS < deadline )); do
  if curl -sf -m 3 "$JF_URL/System/Info/Public" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -sf -m 5 "$JF_URL/System/Info/Public" >/dev/null || die "Jellyfin not responding at $JF_URL"

sudo test -f /var/lib/jellyfin/plugins/Jellyfin.Plugin.JellyfinOnDemand/Jellyfin.Plugin.JellyfinOnDemand.dll \
  || die "plugin DLL missing under /var/lib/jellyfin/plugins"

log="$(sudo find /var/log/jellyfin -maxdepth 1 -type f \( -name 'jellyfin*.log' -o -name 'log_*.log' \) -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-)"
[[ -n "$log" ]] || die "no jellyfin log under /var/log/jellyfin"
ver="${JELLYFIN_ON_DEMAND_VERSION:-}"
if [[ -z "$ver" ]]; then
  # Prefer meta.json next to the deployed DLL when present.
  meta="/var/lib/jellyfin/plugins/Jellyfin.Plugin.JellyfinOnDemand/meta.json"
  if sudo test -f "$meta"; then
    ver="$(sudo cat "$meta" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("version",""))' 2>/dev/null || true)"
  fi
fi
ver="${ver:-0.1.1.0}"
# meta may be 0.1.1.0; logs print 0.1.1.0 or 0.1.1
ver_short="$(printf '%s' "$ver" | sed -E 's/(\.0)+$//')"

if ! sudo grep -qE "Jellyfin on Demand v${ver}|Jellyfin on Demand v${ver_short}|Loaded plugin: Jellyfin on Demand ${ver}|Loaded plugin: Jellyfin on Demand ${ver_short}|Jellyfin\\.Plugin\\.JellyfinOnDemand" "$log"; then
  sudo tail -40 "$log" >&2 || true
  die "plugin not seen in $log"
fi

if ! ldconfig -p 2>/dev/null | grep -q libjellyfin_on_demand_native; then
  test -f /usr/local/lib/libjellyfin_on_demand_native.so || die "native .so missing"
fi

if sudo grep -q 'DllNotFoundException.*jellyfin_on_demand_native' "$log"; then
  die "native DllNotFoundException in logs"
fi

# Client footguns that faceplanted the living-room UI (must not SKIP after deploy)
REQUIRE_LIVE=1 python3 "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/live_public_config_smoke.py" \
  || die "live_public_config_smoke failed"

echo "verify: ok — JellyfinOnDemand ${ver_short} on $JF_URL (Jellyfin Desktop → this host)"
