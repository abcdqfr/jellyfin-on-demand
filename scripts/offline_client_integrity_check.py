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
    if "playViaOverlay" in lucky or "<video controls" in lucky:
        fail("lucky.js must NOT use a DIY <video> overlay — Jellyfin player or fail")
    if "PlayNow" not in lucky or "Sessions/" not in lucky:
        fail("lucky.js must PlayNow a real ItemId via Sessions (JF Desktop player)")
    if "ids:" not in lucky and "ids :" not in lucky:
        fail("lucky.js must try playbackManager.play({ ids }) for real ItemId")
    ctrl = (
        ROOT
        / "plugin/Jellyfin.Plugin.Swarmplay/Jellyfin.Plugin.Swarmplay/Controllers/SwarmController.cs"
    ).read_text(encoding="utf-8", errors="replace")
    if "BindVirtualMovieAsync" not in ctrl or "ILibraryManager" not in ctrl:
        fail("SwarmController must bind a real Movie ItemId via ILibraryManager")
    if "filterRelevant" not in (PLUGIN_JS / "swarm/ranker.js").read_text(encoding="utf-8", errors="replace"):
        fail("ranker.js must filterRelevant weak Torznab title matches")
    releases = (PLUGIN_JS / "swarm/releases.js").read_text(encoding="utf-8", errors="replace")
    if "warming swarm" not in releases:
        fail("releases.js must toast warming after release selection")
    if "filterRelevant" not in releases:
        fail("releases.js must apply filterRelevant before listing")
    if "DisplayName" not in releases:
        fail("releases.js must pass DisplayName into play-bind for virtual item title")
    if "data-f=\"kind\"" not in releases and "data-f='kind'" not in releases:
        fail("releases.js must offer Episode/Batch kind filter for series")
    if "data-f=\"group\"" not in releases and "data-f='group'" not in releases:
        fail("releases.js must offer release-group filter")
    # Magnet hygiene: client must send Magnet with trackers, not null it when BTIH known.
    if "Magnet: btih ? null" in releases or "Magnet:btih?null" in releases.replace(" ", ""):
        fail("releases.js must not null Magnet when BTIH is known (trackers must reach native)")
    if "release.magnet || release.Magnet" not in releases:
        fail("releases.js must pass release magnet into play-bind for ASCII tr= sanitizer")

    swarm_cs = (
        ROOT
        / "plugin/Jellyfin.Plugin.Swarmplay/Jellyfin.Plugin.Swarmplay/Swarm/ISwarmSession.cs"
    ).read_text(encoding="utf-8", errors="replace")
    if "class MagnetSanitizer" not in swarm_cs:
        fail("ISwarmSession.cs must define MagnetSanitizer")
    if "metadata_unreachable" not in swarm_cs:
        fail("SwarmErrorText must map -3 to metadata_unreachable (dead-pin copy)")
    if "HasMetadata" not in swarm_cs or "DhtNodes" not in swarm_cs:
        fail("SwarmStatusResult must expose HasMetadata / DhtNodes for native status surface")

    if "avoid ANSI-corrupted magnet" in ctrl or "request.Magnet = null" in ctrl:
        fail("SwarmController must not null Magnet once BTIH is known")
    if "MagnetSanitizer.BuildAsciiMagnet" not in ctrl:
        fail("SwarmController must sanitize magnets via MagnetSanitizer.BuildAsciiMagnet")

    native_cs = (
        ROOT
        / "plugin/Jellyfin.Plugin.Swarmplay/Jellyfin.Plugin.Swarmplay/Swarm/NativeSwarmSession.cs"
    ).read_text(encoding="utf-8", errors="replace")
    if "MagnetSanitizer.BuildAsciiMagnet" not in native_cs:
        fail("NativeSwarmSession.PreferAsciiSource must prefer sanitized magnet over bare btih")

    api_js = (PLUGIN_JS / "swarm/api.js").read_text(encoding="utf-8", errors="replace")
    if "metadata_unreachable" not in api_js or "Dead pin" not in api_js:
        fail("api.js formatError must surface metadata_unreachable / dead-pin copy")

    check_magnet_sanitizer()
    print("PASS: offline_client_integrity_check")


def build_ascii_magnet(magnet_or_btih: str | None, known_btih: str | None = None) -> str:
    """Mirror of C# MagnetSanitizer.BuildAsciiMagnet for offline regression."""

    def normalize_btih(value: str | None) -> str:
        h = (value or "").strip().lower()
        return h if len(h) in (40, 32) else ""

    def extract_btih(value: str | None) -> str:
        if not value or not value.strip():
            return ""
        text = value.strip()
        marker = "xt=urn:btih:"
        idx = text.lower().find(marker)
        if idx < 0:
            return normalize_btih(text)
        start = idx + len(marker)
        end = start
        while end < len(text) and text[end].isalnum():
            end += 1
        return normalize_btih(text[start:end])

    def is_ascii(s: str) -> bool:
        return all(ord(c) < 128 for c in s)

    def trackers(magnet: str | None) -> list[str]:
        if not magnet:
            return []
        q = magnet.split("?", 1)[1] if "?" in magnet else magnet
        out: list[str] = []
        for part in q.split("&"):
            if not part or "=" not in part:
                continue
            key, val = part.split("=", 1)
            if key.lower() != "tr" or not val or not is_ascii(val):
                continue
            out.append(val)
        return out

    btih = normalize_btih(known_btih) or extract_btih(magnet_or_btih)
    if len(btih) not in (40, 32):
        return ""
    parts = [f"magnet:?xt=urn:btih:{btih}"]
    for tr in trackers(magnet_or_btih):
        parts.append(f"&tr={tr}")
    return "".join(parts)


def check_magnet_sanitizer() -> None:
    btih = "a" * 40
    unicode_dn = (
        f"magnet:?xt=urn:btih:{btih}"
        f"&dn=%E3%82%A2%E3%83%8B%E3%83%A1"  # anime in percent-encoding is ASCII-safe bytes
        f"&tr=udp%3A%2F%2Ftracker.example%3A80"
        f"&tr=http%3A%2F%2Ftracker2.example%2Fannounce"
    )
    # Non-ASCII raw dn (not percent-encoded) must be dropped; tr kept.
    dirty = (
        f"magnet:?xt=urn:btih:{btih}"
        f"&dn=タイトル"
        f"&tr=udp%3A%2F%2Fopen.tracker%3A1337"
        f"&tr=http%3A%2F%2Fascii.only%2Fannounce"
    )
    got = build_ascii_magnet(dirty, btih)
    expect = (
        f"magnet:?xt=urn:btih:{btih}"
        f"&tr=udp%3A%2F%2Fopen.tracker%3A1337"
        f"&tr=http%3A%2F%2Fascii.only%2Fannounce"
    )
    if got != expect:
        fail(f"magnet sanitizer dropped/kept wrong params: got {got!r} expected {expect!r}")
    if "dn=" in got:
        fail("magnet sanitizer must drop dn=")
    if "tr=" not in got:
        fail("magnet sanitizer must keep tr=")

    bare = build_ascii_magnet(None, btih)
    if bare != f"magnet:?xt=urn:btih:{btih}":
        fail(f"bare btih must become xt-only magnet, got {bare!r}")

    # Percent-encoded unicode in dn is ASCII bytes but still dropped (not tr).
    got2 = build_ascii_magnet(unicode_dn, btih)
    if "dn=" in got2:
        fail("magnet sanitizer must drop dn= even when percent-encoded")
    if "tracker.example" not in got2 or "tracker2.example" not in got2:
        fail("magnet sanitizer must keep all ASCII tr= from original")



if __name__ == "__main__":
    main()
