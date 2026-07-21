# Strmarr Cherry-Pick Index — P4-02

Paths are via the `third-party/strmarr` **symlink** (lessons only). Do **not**
import Go code (I10). Do **not** run strmarr services for Swarmplay.

| Path | Notes |
|---|---|
| `third-party/strmarr/engine/cache/manager.go` | Cache lifecycle |
| `third-party/strmarr/engine/cache/eviction.go` | Cache eviction |
| `third-party/strmarr/engine/cache/profile.go` | Cache profiles |
| `third-party/strmarr/engine/config/cache_resolve.go` | Cache configuration |
| `third-party/strmarr/internal/server/cache_ops.go` | Cache operations |
| `third-party/strmarr/cmd/strmarr/metainfo-cache.go` | Metainfo cache |
| `third-party/strmarr/internal/jellyfin/sessions.go` | Playback sessions |
| `third-party/strmarr/internal/playback/service.go` | Session playback |
| `third-party/strmarr/internal/server/playback_ops.go` | Playback session operations |
| `third-party/strmarr/engine/torrent/anacrolix/manager.go` | Torrent session manager (do not import) |
| `third-party/strmarr/engine/torrent/manager.go` | Torrent management |
| `third-party/strmarr/third_party/fluxtorrent/internal/engine/seeding.go` | Seeding policy |
| `third-party/strmarr/third_party/fluxtorrent/internal/engine/janitor.go` | Idle cleanup |
| `third-party/strmarr/docs/ops/cache-pins.md` | Cache pinning guidance |
| `third-party/strmarr/docs/adr/005-cache-warmth-budget.md` | Cache warmth policy |
