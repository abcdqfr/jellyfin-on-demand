# Seed and idle policy

Swarmplay keeps completed or recently played content available long enough to
support healthy sharing, then releases it according to an explicit retention
policy.

```yaml
swarm:
  cache:
    hold_after_play: 30m
    idle_ttl: 2h
    retain: bounded
    max_size: 50GiB
  seeding:
    enabled: true
    after_play: 60m
    held_cache: true
    upload:
      enabled: true
    acquisition:
      min_seeders: 3
```

## Semantics

- `hold_after_play` prevents immediate cache eviction when playback ends.
- `idle_ttl` evicts unreferenced cache entries after their last active use.
- `after_play` is the minimum additional seeding window after playback.
- `held_cache` allows entries retained by the cache policy to remain seedable.
- `upload.enabled` controls outbound piece sharing independently of downloads.
- `min_seeders` is the availability floor required before starting a new grab.
- `retain` selects eviction behavior; `bounded` obeys `max_size`.

## Lore defaults

These are product defaults, not imported implementation constants: retain
played data for 30 minutes, expire idle entries after 2 hours, seed for 60
minutes after play, require 3 seeders, and cap a bounded cache at 50 GiB.

Users may choose a more conservative retention policy for limited storage, or
a longer seed window when contributing bandwidth is a priority.
