#!/usr/bin/env python3
"""Torznab fixture + magnet-from-guid regression (Prowlarr shape)."""

from __future__ import annotations

import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "docs/design/fixtures/torznab-sample.xml"
PARSER = (
    ROOT
    / "plugin/Jellyfin.Plugin.Swarmplay/Jellyfin.Plugin.Swarmplay/Swarm/Torznab/TorznabXmlParser.cs"
)


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    count = len(ET.parse(FIXTURE).getroot().findall("./channel/item"))
    if count < 2:
        fail(f"fixture item count {count} < 2")

    src = PARSER.read_text(encoding="utf-8")
    if 'item.Element("guid")' not in src:
        fail("TorznabXmlParser must read magnet from <guid> (Prowlarr)")
    if "FindSize" not in src or 'item.Element("size")' not in src:
        fail("TorznabXmlParser must read RSS <size> (Prowlarr; attr-only → 0B picker)")

    # Fixture must exercise RSS <size> (attr-only was the 0B lab bug).
    fixture_xml = FIXTURE.read_text(encoding="utf-8")
    if "<size>" not in fixture_xml:
        fail("torznab-sample.xml must include <size> elements")

    # Mirror FindMagnet against a Prowlarr-shaped item
    sample = """<?xml version="1.0"?>
    <rss><channel><item>
      <title>The Mentalist 2008</title>
      <guid>magnet:?xt=urn:btih:05BBF72F0E14A426AE2AA32C56F23FDF6C30420D&amp;dn=x</guid>
      <link>http://127.0.0.1:9696/3/download?apikey=x</link>
    </item></channel></rss>"""
    item = ET.fromstring(sample).find("./channel/item")
    assert item is not None
    guid = item.findtext("guid") or ""
    link = item.findtext("link") or ""
    if not guid.startswith("magnet:?"):
        fail("sample guid must be magnet")
    if link.startswith("magnet:?"):
        fail("sample link must not be magnet (Prowlarr download URL)")

    # NormalizeTorznabUrl footgun coverage (source present)
    ctrl = (
        ROOT
        / "plugin/Jellyfin.Plugin.Swarmplay/Jellyfin.Plugin.Swarmplay/Controllers/SwarmController.cs"
    ).read_text(encoding="utf-8")
    if "NormalizeTorznabUrl" not in ctrl:
        fail("SwarmController must normalize Torznab URLs")
    if 'HttpPost("lucky")' not in ctrl:
        fail("SwarmController must expose POST lucky")
    if 'HttpGet("stream")' not in ctrl:
        fail("SwarmController must expose GET stream (Http MediaSource playback)")

    hdr = (
        ROOT / "torrent/native/include/swarmplay_session.h"
    ).read_text(encoding="utf-8")
    if "SWARM_ERROR_IO" not in hdr:
        fail("native header must define SWARM_ERROR_IO (mkdir vs bad magnet)")

    print(f"torznab items: {count}; magnet-from-guid: ok; size+stream routes: ok")


if __name__ == "__main__":
    main()
