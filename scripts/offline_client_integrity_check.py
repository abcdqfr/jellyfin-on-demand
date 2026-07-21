#!/usr/bin/env python3
"""Fail the gate on client/route footguns that already burned us in lab.

Catches:
- Admin config still calling /JellyfinEnhanced/* after the Swarmplay rename
- Search init gated on JellyseerrShowSearchResults when Swarmplay discovery is the product path
- Missing jellyseerr chrome scripts in plugin.js load list
- JS syntax errors in every file plugin.js loads
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLUGIN_JS = ROOT / "plugin/Jellyfin.Plugin.Swarmplay/Jellyfin.Plugin.Swarmplay/js"
PLUGIN_MAIN = PLUGIN_JS / "plugin.js"
CONFIG_PAGE = (
    ROOT
    / "plugin/Jellyfin.Plugin.Swarmplay/Jellyfin.Plugin.Swarmplay/Configuration/configPage.html"
)


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    if not PLUGIN_MAIN.is_file():
        fail(f"missing {PLUGIN_MAIN}")
    if not CONFIG_PAGE.is_file():
        fail(f"missing {CONFIG_PAGE}")

    cfg = CONFIG_PAGE.read_text(encoding="utf-8", errors="replace")
    # Allow GitHub upstream URLs; forbid plugin API routes still on the old prefix.
    bad_api = re.findall(
        r"""ApiClient\.getUrl\(\s*[`'"]/?JellyfinEnhanced/""",
        cfg,
    )
    if bad_api:
        fail(
            "configPage.html still calls ApiClient.getUrl('/JellyfinEnhanced/...') "
            f"({len(bad_api)} hit(s)) — use /Swarmplay/ (TMDB validate 404 class of bug)"
        )
    if "/JellyfinEnhanced/tmdb/validate" in cfg:
        fail("configPage.html still references /JellyfinEnhanced/tmdb/validate")
    if "/Swarmplay/tmdb/validate" not in cfg:
        fail("configPage.html missing /Swarmplay/tmdb/validate")

    main_js = PLUGIN_MAIN.read_text(encoding="utf-8", errors="replace")
    required_scripts = [
        "jellyseerr/seerr-status.js",
        "jellyseerr/api.js",
        "jellyseerr/jellyseerr.js",
        "jellyseerr/ui.js",
    ]
    for rel in required_scripts:
        if rel not in main_js:
            fail(f"plugin.js must load {rel} for Swarmplay discovery chrome")

    # The gate that wiped search after ADR-004: requiring ShowSearchResults when
    # only SwarmplayDiscoveryEnabled is set.
    if re.search(
        r"SwarmplayDiscoveryEnabled[\s\S]{0,200}?JellyseerrShowSearchResults\s*!==\s*false",
        main_js,
    ) and "swarmDiscovery" not in main_js:
        fail("plugin.js appears to gate Swarmplay discovery on JellyseerrShowSearchResults")

    jelly = (PLUGIN_JS / "jellyseerr/jellyseerr.js").read_text(encoding="utf-8", errors="replace")
    if "swarmDiscovery" not in jelly:
        fail("jellyseerr.js must honor SwarmplayDiscoveryEnabled (swarmDiscovery)")
    if "!swarmDiscovery && JE.pluginConfig.JellyseerrShowSearchResults === false" not in jelly:
        fail(
            "jellyseerr.js must gate JellyseerrShowSearchResults behind !swarmDiscovery "
            "(otherwise Swarmplay search is dead when ADR-004 left ShowSearchResults=false)"
        )

    # Syntax-check every script referenced in the component list.
    scripts = re.findall(r"'((?:enhanced|elsewhere|swarm|jellyseerr|tags|extras|others)/[^']+\.js)'", main_js)
    if len(scripts) < 20:
        fail(f"plugin.js script list looks too short ({len(scripts)})")
    for rel in scripts:
        path = PLUGIN_JS / rel
        if not path.is_file():
            fail(f"plugin.js loads missing file: {rel}")
        proc = subprocess.run(
            ["node", "--check", str(path)],
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            fail(f"node --check failed for {rel}: {proc.stderr.strip()}")

    # Path-only fake items toast "playing" without a player — require Http stream path.
    lucky = (PLUGIN_JS / "swarm/lucky.js").read_text(encoding="utf-8", errors="replace")
    if "/Swarmplay/swarm/stream" not in lucky:
        fail("lucky.js must build /Swarmplay/swarm/stream URL for real playback")
    if "Protocol: 'Http'" not in lucky and 'Protocol: "Http"' not in lucky:
        fail("lucky.js must use MediaSource Protocol Http (not Path-only File)")
    releases = (PLUGIN_JS / "swarm/releases.js").read_text(encoding="utf-8", errors="replace")
    if "warming swarm" not in releases:
        fail("releases.js must toast warming after release selection")
    if "player did not start" not in releases:
        fail("releases.js must not claim playing when the player did not start")

    print("PASS: offline_client_integrity_check")


if __name__ == "__main__":
    main()
