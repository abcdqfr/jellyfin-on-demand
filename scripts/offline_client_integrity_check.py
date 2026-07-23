#!/usr/bin/env python3
"""Fail the gate on client/route footguns that already burned us in lab.

Catches:
- Admin config still calling /JellyfinEnhanced/* after the JellyfinOnDemand rename
- Search init gated on JellyseerrShowSearchResults when JellyfinOnDemand discovery is the product path
- Missing jellyseerr chrome scripts in plugin.js load list
- JS syntax errors in every file plugin.js loads
"""

from __future__ import annotations

import re
import subprocess
import sys
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLUGIN_JS = ROOT / "plugin/Jellyfin.Plugin.JellyfinOnDemand/Jellyfin.Plugin.JellyfinOnDemand/js"
PLUGIN_MAIN = PLUGIN_JS / "plugin.js"
CONFIG_PAGE = (
    ROOT
    / "plugin/Jellyfin.Plugin.JellyfinOnDemand/Jellyfin.Plugin.JellyfinOnDemand/Configuration/configPage.html"
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
            f"({len(bad_api)} hit(s)) — use /JellyfinOnDemand/ (TMDB validate 404 class of bug)"
        )
    if "/JellyfinEnhanced/tmdb/validate" in cfg:
        fail("configPage.html still references /JellyfinEnhanced/tmdb/validate")
    if "/JellyfinOnDemand/tmdb/validate" not in cfg:
        fail("configPage.html missing /JellyfinOnDemand/tmdb/validate")

    main_js = PLUGIN_MAIN.read_text(encoding="utf-8", errors="replace")
    required_scripts = [
        "jellyseerr/seerr-status.js",
        "jellyseerr/api.js",
        "jellyseerr/jellyseerr.js",
        "jellyseerr/ui.js",
    ]
    for rel in required_scripts:
        if rel not in main_js:
            fail(f"plugin.js must load {rel} for JellyfinOnDemand discovery chrome")

    # The gate that wiped search after ADR-004: requiring ShowSearchResults when
    # only JellyfinOnDemandDiscoveryEnabled is set.
    if re.search(
        r"JellyfinOnDemandDiscoveryEnabled[\s\S]{0,200}?JellyseerrShowSearchResults\s*!==\s*false",
        main_js,
    ) and "swarmDiscovery" not in main_js:
        fail("plugin.js appears to gate JellyfinOnDemand discovery on JellyseerrShowSearchResults")

    jelly = (PLUGIN_JS / "jellyseerr/jellyseerr.js").read_text(encoding="utf-8", errors="replace")
    if "swarmDiscovery" not in jelly:
        fail("jellyseerr.js must honor JellyfinOnDemandDiscoveryEnabled (swarmDiscovery)")
    if "!swarmDiscovery && JE.pluginConfig.JellyseerrShowSearchResults === false" not in jelly:
        fail(
            "jellyseerr.js must gate JellyseerrShowSearchResults behind !swarmDiscovery "
            "(otherwise JellyfinOnDemand search is dead when ADR-004 left ShowSearchResults=false)"
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
        / "plugin/Jellyfin.Plugin.JellyfinOnDemand/Jellyfin.Plugin.JellyfinOnDemand/Controllers/SwarmController.cs"
    ).read_text(encoding="utf-8", errors="replace")
    if "BindVirtualMovieAsync" not in ctrl or "ILibraryManager" not in ctrl:
        fail("SwarmController must bind a real Movie ItemId via ILibraryManager")
    # 0.2.2 regression guard: Jellyfin's ProbeProvider.FetchVideoInfo hard-skips
    # ffprobe for any item with IsVirtualItem == true, regardless of refresh mode —
    # that silently zeroed MediaStreams (no audio/subs) even with warm extents.
    if "IsVirtualItem = true" in ctrl:
        fail(
            "SwarmController must NOT set IsVirtualItem = true on the bound Movie — "
            "Jellyfin's ProbeProvider skips ffprobe unconditionally for virtual items, "
            "which zeroes MediaStreams (silent/sub-less playback) even after the file is warm"
        )
    if "IsVirtualItem = false" not in ctrl:
        fail("SwarmController must set IsVirtualItem = false on the bound Movie")
    if "RefreshMetadata" not in ctrl or "MetadataRefreshMode.FullRefresh" not in ctrl:
        fail("SwarmController must force RefreshMetadata(FullRefresh) after the extent gate so MediaStreams populate")
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
        / "plugin/Jellyfin.Plugin.JellyfinOnDemand/Jellyfin.Plugin.JellyfinOnDemand/Swarm/ISwarmSession.cs"
    ).read_text(encoding="utf-8", errors="replace")
    if "class MagnetSanitizer" not in swarm_cs:
        fail("ISwarmSession.cs must define MagnetSanitizer")
    if "metadata_unreachable" not in swarm_cs:
        fail("SwarmErrorText must map -3 to metadata_unreachable (dead-pin copy)")
    if "HasMetadata" not in swarm_cs or "DhtNodes" not in swarm_cs:
        fail("SwarmStatusResult must expose HasMetadata / DhtNodes for native status surface")

    if "avoid ANSI-corrupted magnet" in ctrl or "request.Magnet = null" in ctrl:
        fail("SwarmController must not null Magnet once BTIH is known")
    if "fail_open" in ctrl or "HasFailOpenBytes" in ctrl:
        fail("PlayBind must not fail-open on FileInfo.Length (sparse prealloc fools it)")

    if "MagnetSanitizer.BuildAsciiMagnet" not in ctrl:
        fail("SwarmController must sanitize magnets via MagnetSanitizer.BuildAsciiMagnet")

    native_cs = (
        ROOT
        / "plugin/Jellyfin.Plugin.JellyfinOnDemand/Jellyfin.Plugin.JellyfinOnDemand/Swarm/NativeSwarmSession.cs"
    ).read_text(encoding="utf-8", errors="replace")
    if "MagnetSanitizer.BuildAsciiMagnet" not in native_cs:
        fail("NativeSwarmSession.PreferAsciiSource must prefer sanitized magnet over bare btih")

    api_js = (PLUGIN_JS / "swarm/api.js").read_text(encoding="utf-8", errors="replace")
    if "metadata_unreachable" not in api_js or "Dead pin" not in api_js:
        fail("api.js formatError must surface metadata_unreachable / dead-pin copy")

    # 0.2 search history surface
    if "swarm/history.js" not in main_js:
        fail("plugin.js must load swarm/history.js after lucky.js")
    lucky_idx = main_js.find("'swarm/lucky.js'")
    hist_idx = main_js.find("'swarm/history.js'")
    if lucky_idx < 0 or hist_idx < 0 or hist_idx < lucky_idx:
        fail("plugin.js must load swarm/history.js after swarm/lucky.js")
    history_js = (PLUGIN_JS / "swarm/history.js").read_text(encoding="utf-8", errors="replace")
    if "jellyfin-on-demand-history-float" in history_js:
        fail("history.js must not resurrect the omnipresent floating History control")
    if "searchTextInput" not in history_js or "JE.swarmHistory" not in history_js:
        fail(
            "history.js must expose an inline browser-esque dropdown anchored to "
            "#searchTextInput via JE.swarmHistory"
        )
    if "deleteHistory" not in history_js or "clearHistory" not in history_js:
        fail("history.js dropdown must offer per-entry remove and a clear-history action")
    if "focusin" not in history_js or "pointerdown" not in history_js:
        fail("history.js must open on first click via capture focusin/pointerdown")
    if "playLast" not in history_js or "searchAgain" not in history_js:
        fail("history.js must offer play-last + search-again actions (not jellyseerrMoreInfo)")
    if "showEpisodePicker" not in history_js:
        fail("history.js playLast must reopen the episode picker for multi-file TV entries")
    if "jellyseerrMoreInfo.open" in history_js or "jellyseerrMoreInfo?.open" in history_js:
        fail("history.js must not call jellyseerrMoreInfo.open (Failed to load media information)")
    if "listHistory" not in api_js or "upsertHistory" not in api_js or "clearHistory" not in api_js:
        fail("api.js must expose history CRUD helpers")
    if '"history"' not in ctrl and 'HttpGet("history")' not in ctrl:
        fail("SwarmController must expose GET /history")
    if 'HttpPost("history")' not in ctrl or 'HttpDelete("history")' not in ctrl:
        fail("SwarmController must expose POST/DELETE /history")
    if 'HttpPost("history/{id}/pin")' not in ctrl and 'history/{id}/pin' not in ctrl:
        fail("SwarmController must expose POST /history/{id}/pin")
    store_cs = (
        ROOT
        / "plugin/Jellyfin.Plugin.JellyfinOnDemand/Jellyfin.Plugin.JellyfinOnDemand/Swarm/SearchHistoryStore.cs"
    ).read_text(encoding="utf-8", errors="replace")
    if "swarm-history.json" not in store_cs or "MaxUnpinned" not in store_cs:
        fail("SearchHistoryStore must persist swarm-history.json with unpinned cap")
    if "recordSearch" not in releases or "recordPlay" not in releases:
        fail("releases.js must auto-record search + play into history")
    if "recordPlay" not in lucky:
        fail("lucky.js must auto-record play-bind ready into history")

    # 0.3 batch episode fanout
    if "listFiles" not in api_js:
        fail("api.js must expose listFiles → POST /list-files")
    if 'HttpPost("list-files")' not in ctrl:
        fail("SwarmController must expose POST /list-files")
    if "showEpisodePicker" not in releases or "FileIndexExplicit" not in releases:
        fail("releases.js must offer episode-in-batch picker with FileIndexExplicit")
    if "jellyfin-on-demand-ep-table" not in releases or "data-sort" not in releases:
        fail("releases.js episode picker must be a sortable table (data-sort columns)")
    if "jellyfinOnDemandPlayLucky" not in releases:
        fail("releases.js must expose jellyfinOnDemandPlayLucky (rank-top + episode picker, no silent TV pick)")
    if "swarmShowWarmOverlay" not in releases:
        fail("releases.js must use warm overlay during play-bind")
    lucky_full = (PLUGIN_JS / "swarm/lucky.js").read_text(encoding="utf-8", errors="replace")
    if "swarmSetBatchSession" not in lucky_full or "playBatchNeighbor" not in lucky_full:
        fail("lucky.js must expose batch prev/next neighbor play")
    if "swarmShowWarmOverlay" not in lucky_full:
        fail("lucky.js must export swarmShowWarmOverlay")
    if "btnPreviousTrack" not in lucky_full or "btnNextTrack" not in lucky_full:
        fail("lucky.js must hijack native .btnPreviousTrack/.btnNextTrack (no floating batch chrome)")
    seq_cpp = (ROOT / "torrent/native/src/session_stub.cpp").read_text(encoding="utf-8", errors="replace")
    if "readahead_pieces" not in seq_cpp:
        fail("sequential phase must force readahead piece deadlines (anti blaze-ahead)")
    if "readahead_ready" not in seq_cpp:
        fail("warm_complete must gate Play on contiguous readahead_ready (anti blaze-ahead)")
    session_cs = (
        ROOT
        / "plugin/Jellyfin.Plugin.JellyfinOnDemand/Jellyfin.Plugin.JellyfinOnDemand/Swarm/ISwarmSession.cs"
    ).read_text(encoding="utf-8", errors="replace")
    if "FileIndexExplicit" not in session_cs:
        fail("SwarmEnsureRequest must carry FileIndexExplicit")
    if "TryParseEpisode" not in session_cs:
        fail("FileIndexPicker must expose TryParseEpisode")
    if "NormalizeAbsoluteSeasonEpisodes" not in session_cs:
        fail("FileIndexPicker must port strmarr absolute-episode normalize")

    # 0.4 cache-to-library
    if "CacheEnsureAsync" not in session_cs or "CacheStatusAsync" not in session_cs:
        fail("ISwarmSession must expose CacheEnsureAsync/CacheStatusAsync (0.4)")
    if "SwarmCacheBindResult" not in session_cs:
        fail("ISwarmSession must define SwarmCacheBindResult (0.4)")
    if "swarm_cache_ensure" not in seq_cpp or "swarm_cache_status" not in seq_cpp:
        fail("native must expose swarm_cache_ensure/swarm_cache_status (0.4 whole-file download)")
    native_header = (
        ROOT / "torrent/native/include/jellyfin_on_demand_session.h"
    ).read_text(encoding="utf-8", errors="replace")
    if "swarm_cache_ensure" not in native_header or "float progress" not in native_header:
        fail("jellyfin_on_demand_session.h must declare swarm_cache_ensure + progress ABI field (0.4)")
    if 'HttpPost("cache-bind")' not in ctrl or 'HttpGet("cache-status")' not in ctrl:
        fail("SwarmController must expose POST cache-bind + GET cache-status (0.4)")
    if "ResolveLibraryVirtualFolder" not in ctrl or "ValidateChildren" not in ctrl:
        fail("SwarmController must auto-resolve a JF library by MediaType and scan it on cache complete (0.4)")
    if "cacheBind" not in api_js or "cacheStatus" not in api_js:
        fail("api.js must expose cacheBind/cacheStatus (0.4)")
    if "swarmAddToLibrary" not in releases or "cacheBindAndStart" not in releases:
        fail("releases.js must expose swarmAddToLibrary + cacheBindAndStart (0.4)")
    if "jellyseerr-button-jellyfin-on-demand-library" not in (PLUGIN_JS / "jellyseerr/ui.js").read_text(
        encoding="utf-8", errors="replace"
    ):
        fail("ui.js missing Add to Library button (jellyseerr-button-jellyfin-on-demand-library)")

    # 0.4.1 hotfix: "Stream" = real .strm library pointer (strmarr-style), not the
    # plain Play button's ephemeral flow — and readahead/progress regression fixes.
    if "StreamUrl" not in session_cs:
        fail("SwarmEnsureRequest must carry StreamUrl (stream-bind .strm pointer content)")
    if 'HttpPost("stream-bind")' not in ctrl:
        fail("SwarmController must expose POST stream-bind (.strm pointer, strmarr-style)")
    if "TriggerLibraryScanAsync" not in ctrl:
        fail("SwarmController must share a folder-scoped scan helper between cache + stream binds")
    if "streamBind" not in api_js:
        fail("api.js must expose streamBind → POST /stream-bind")
    if "streamBindAndStart" not in releases or "streamRelease" not in releases:
        fail("releases.js must expose streamRelease/streamBindAndStart (.strm Add to Library)")
    if "mode === 'strm'" not in releases:
        fail("releases.js release picker must support strm mode distinct from play/cache")
    if "kReadaheadFloorBytes" not in seq_cpp:
        fail("apply_sequential_phase must bound the readahead window in bytes, not raw piece count (regression fix)")
    if "max(head_end + 1, 8)" in seq_cpp or "max(head_end+1, 8)" in seq_cpp:
        fail("readahead must not force an 8-piece floor (piece-count balloon on large piece_length)")
    if "first_missing + 48" in seq_cpp:
        fail("slide window must be byte-bounded (kReadaheadFloorBytes), not first_missing + 48 pieces")
    if "warm_progress" not in seq_cpp:
        fail("swarm_status progress must reflect warm_progress (tail+head[+readahead] fraction), not raw torrent progress")
    if "startWarmProgressPoll" not in lucky_full or "jellyfin-on-demand-warm-bar-fill" not in lucky_full:
        fail("lucky.js warm overlay must render/poll a real progress bar, not just a spinner")

    # Discover pane (Seerr-shaped home next to Enhanced/Bookmarks)
    discover_js = (PLUGIN_JS / "swarm/discover-page.js").read_text(encoding="utf-8", errors="replace")
    if "initializeDiscoverPage" not in discover_js or "je-nav-discover-item" not in discover_js:
        fail("discover-page.js must expose initializeDiscoverPage + sidebar nav (je-nav-discover-item)")
    # 0.5.1: search landing Discover link is intentionally disabled (was broken).
    if re.search(r"(?m)^\s*watchSearchLanding\(\);", discover_js):
        fail("discover-page.js must not call watchSearchLanding() — search→Discover link disabled in 0.5.1")
    if "querySelectorAll('.jellyfin-on-demand-discover-landing-link')" not in discover_js:
        fail("discover-page.js must strip leftover .jellyfin-on-demand-discover-landing-link nodes (search link disabled)")
    if "SECTION_SELECTOR" not in discover_js or ".sections.jellyfin-on-demand-discover" not in discover_js:
        fail("discover-page.js must query .sections.jellyfin-on-demand-discover (compound class), not `.${SECTION_CLASS}`")
    if "querySelector(`.${SECTION_CLASS}`)" in discover_js or 'querySelector(`.${SECTION_CLASS}`)' in discover_js:
        fail("discover-page.js must not querySelector(`.${SECTION_CLASS}`) — that yields an empty Discover pane")
    if "takeover" not in discover_js or "swarmHideDiscover" not in discover_js:
        fail("discover-page.js must yield for player/details (takeover) and export swarmHideDiscover")
    lucky_js_disc = (PLUGIN_JS / "swarm/lucky.js").read_text(encoding="utf-8", errors="replace")
    if "swarmHideDiscover" not in lucky_js_disc:
        fail("lucky.js must hide Discover before attemptPlayback so video is not buried")
    releases_js_disc = (PLUGIN_JS / "swarm/releases.js").read_text(encoding="utf-8", errors="replace")
    if "swarmHideDiscover" not in releases_js_disc:
        fail("releases.js must hide Discover in playBindAndStart before warm/play")
    jellyseerr_api_js = (PLUGIN_JS / "jellyseerr/api.js").read_text(encoding="utf-8", errors="replace")
    if "fetchDiscoverTrending" not in jellyseerr_api_js or "fetchDiscoverMovies" not in jellyseerr_api_js:
        fail("jellyseerr/api.js must expose fetchDiscoverTrending/Movies/Tv for Discover pane")
    enhanced_ctrl = (
        ROOT
        / "plugin/Jellyfin.Plugin.JellyfinOnDemand/Jellyfin.Plugin.JellyfinOnDemand/Controllers/JellyfinOnDemandController.cs"
    ).read_text(encoding="utf-8", errors="replace")
    if 'HttpGet("jellyseerr/discover/trending")' not in enhanced_ctrl or 'HttpGet("jellyseerr/discover/movies")' not in enhanced_ctrl:
        fail("JellyfinOnDemandController must expose discover/trending + discover/movies (TMDB-backed)")
    if "IsJellyfinOnDemandTmdbMode" not in enhanced_ctrl or "FetchTmdbAsJellyseerrAsync" not in enhanced_ctrl:
        fail("Controller must route JellyfinOnDemand discover through TMDB (IsJellyfinOnDemandTmdbMode)")
    if "swarm/discover-page.js" not in (PLUGIN_JS / "plugin.js").read_text(encoding="utf-8", errors="replace"):
        fail("plugin.js must load swarm/discover-page.js")
    if "initializeDiscoverPage" not in (PLUGIN_JS / "plugin.js").read_text(encoding="utf-8", errors="replace"):
        fail("plugin.js must call initializeDiscoverPage when JellyfinOnDemandDiscoveryEnabled")
    discover_html = (
        ROOT
        / "plugin/Jellyfin.Plugin.JellyfinOnDemand/Jellyfin.Plugin.JellyfinOnDemand/PluginPages/DiscoverPage.html"
    )
    if not discover_html.is_file():
        fail("PluginPages/DiscoverPage.html missing")
    enhanced_cs = (
        ROOT / "plugin/Jellyfin.Plugin.JellyfinOnDemand/Jellyfin.Plugin.JellyfinOnDemand/JellyfinOnDemand.cs"
    ).read_text(encoding="utf-8", errors="replace")
    if 'Name = "discoverPage"' not in enhanced_cs:
        fail("JellyfinOnDemand.GetViews must register discoverPage")

    ui_js = (PLUGIN_JS / "jellyseerr/ui.js").read_text(encoding="utf-8", errors="replace")
    lucky_js = (PLUGIN_JS / "swarm/lucky.js").read_text(encoding="utf-8", errors="replace")
    if "jellyseerr-button-jellyfin-on-demand-lucky" not in ui_js:
        fail("ui.js missing Lucky button (jellyseerr-button-jellyfin-on-demand-lucky)")
    if "playFeelingLucky" not in lucky_js or "JE.playFeelingLucky" not in lucky_js:
        fail("lucky.js must export playFeelingLucky")
    if "api.lucky" not in api_js:
        fail("api.js must expose api.lucky → POST /lucky")
    native_cpp = (ROOT / "torrent/native/src/session_stub.cpp").read_text(encoding="utf-8", errors="replace")
    if "warm phase=tail" not in native_cpp or "warm_band_bytes" not in native_cpp:
        fail("native must apply mature tail→head warm (warm_band_bytes + phase=tail)")
    if "kWarmFloorBytes" not in native_cpp or "8 * kMiB" not in native_cpp:
        fail("native missing strmarr 8 MiB warm floor")
    if "extent gate OK" not in native_cpp and "kWarmBlockTimeout" not in native_cpp:
        fail("native must block in ensure until extent gate (PreparePlay)")

    check_magnet_sanitizer()
    
    # Former product name must be absent (literally zero) from the working tree.
    former = ("swarm" + "play").lower()
    stream = ("stream" + "play").lower()
    pat = re.compile(re.escape(former) + "|" + re.escape(stream), re.I)
    skip = {".git", "node_modules", ".tools", "nuget", "dotnet-cli-home"}
    leftovers = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        parts = set(Path(dirpath).relative_to(ROOT).parts)
        if parts & skip:
            dirnames[:] = []
            continue
        # skip binary build outputs by dirname
        dirnames[:] = [d for d in dirnames if d not in skip]
        for name in filenames:
            fp = Path(dirpath) / name
            rel = str(fp.relative_to(ROOT))
            if pat.search(rel):
                leftovers.append(rel)
                continue
            try:
                data = fp.read_bytes()
            except OSError:
                continue
            if b"\0" in data[:8192]:
                continue
            try:
                text = data.decode("utf-8")
            except UnicodeDecodeError:
                continue
            if pat.search(text):
                leftovers.append(rel)
    if leftovers:
        fail(
            "former product name still present (want 0): "
            + ", ".join(leftovers[:20])
            + ("…" if len(leftovers) > 20 else "")
        )

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
