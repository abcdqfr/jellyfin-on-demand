# Wi-Fi warmup

Use the upcoming Wi-Fi window once to make ordinary development offline-capable:
restore packages, build, and run unit/offline checks. Live Torznab discovery and
Jellyfin playback validation still require a networked test session.

## Ordered checklist

1. Install native and .NET prerequisites with `apt`:
   - .NET SDK: this project has a Jellyfin 10 / `net9` path and a Jellyfin 12 /
     `net10` path. Prefer an SDK installation that builds both; if the distro
     packages make that impractical, install the SDK for the Jellyfin 10 /
     `net9` path first and record the choice.
   - `libtorrent-rasterbar-dev`
   - `pkg-config`
2. Verify the project path, then restore it once:
   ```sh
   ls plugin/Jellyfin.Plugin.JellyfinOnDemand/Jellyfin.Plugin.JellyfinOnDemand/JellyfinOnDemand.csproj
   dotnet restore plugin/Jellyfin.Plugin.JellyfinOnDemand/Jellyfin.Plugin.JellyfinOnDemand/JellyfinOnDemand.csproj
   ```
   Follow with the applicable `dotnet build` and unit-test commands while the
   restored cache is warm.
3. Optionally configure the native stubs with CMake. A link failure is expected
   until the real native implementation lands; configuration is still useful to
   cache the toolchain and validate headers.
4. Run the machine-local checks:
   ```sh
   scripts/offline_ranker_check.mjs
   scripts/offline_ready_check.py
   scripts/offline_torznab_check.py
   scripts/offline_warm_order_check.py
   scripts/offline_growing_file_check.py
   ```
5. Make the first real Ensure spike `P1-07`: link libtorrent and implement
   Ensure.
6. Then do `P1-08`: integration from magnet to growing file to Jellyfin play.
   Test real playback only while network/Jellyfin are available.
7. Restore once and avoid repeat pulls. There is no need to deepen the Seerr
   clone. Do not push unless explicitly asked.

## Bandwidth boundary

The warm cache supports offline source work, unit tests, and builds. It does not
replace a live Torznab endpoint, torrent peers, or a networked playback test.
