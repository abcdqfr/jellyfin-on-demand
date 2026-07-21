# Lessons and realizations (no prior art to copy)

Scar tissue from the strmarr / *arr / Jellyfin walk. **Do not port code** from
`internal/` or `engine/`. Re-derive only if a lesson forces it.

## Product shape

1. **The living-room pane is Jellyfin (+ Enhanced).** Separate middleware UIs
   and request apps fight the remote. Play should feel like one surface.
2. **Fake download-client LARP is a trap.** Speaking qBittorrent to satisfy
   Sonarr/Radarr creates CDH noise, quiet-import erasing evidence, and “grab
   worked but library empty” confusion (movies staged under downloads, not
   `movie.Path`).
3. **`.strm` is an adapter, not a product.** It exists to make JF scan a URL.
   If the plugin owns play binding, the adapter is optional debt.
4. **HTTP media server is optional debt.** JF needs bytes; a growing sequential
   file may be enough. A range bridge is a fallback, not an identity.
5. **In-process anacrolix was a choice to own piece priority + cache.** VLC’s
   bittorrent plugin shows the other shape: thin access layer + system
   libtorrent. That shape matches this experiment. strmarr still holds the
   **cache prefs** and **typical BT seeding-options** story — re-read those
   scars; do not re-invent idle/seed/eviction from vibes.

## Swarm / play

6. **btih (+ file index) is enough identity** for play. Slot URLs and *arr
   history resolvers were workarounds for not owning the pane.
7. **Sequential download is the play contract.** Whole-file high priority is a
   footgun (probe/open paths that mark the entire file high will pull gigabytes
   before “warm” finishes).
8. **Head + tail warm helps MKV** (cues / embedded subs). Keep it a piece
   nudge with small floors — not a second subtitle product (no PSR/SubGate
   cosplay unless play is broken without it).
8b. **Warm tail before head.** Seeking the swarm to the end first, then the
   start, jumps the download cursor less than head-then-tail (less thrash
   before sequential play).
9. **Transcode/remux pain is often JF + client**, not the swarm (HEVC 10-bit,
   probesize, HLS VOD). Do not solve Fire TV with a fatter torrent stack.

## Multi-user / ops

10. **One *arr root ⇒ one silo.** Per-person libraries need per-root (or
    abandon *arr for identity). Irrelevant to MVP without *arr.
11. **“Never got strm” often means “wrong place / wrong observer.”** Check the
    actual write path and whether the library scanner sees it — then ask whether
    that path should exist at all.
11b. **Cache / seed knobs (strmarr lore, re-derive in Swarmplay):** hold after
    play, idle TTL, seed-after-play minutes, seed-held-cache, upload enabled,
    min seeders to grab, retain mode / max cache size. Defaults worth stealing
    as *numbers* (e.g. seed-after-play ~60m, min seeders ~3) — not Go code.
    (Former sister-repo settings field names; re-derive in Swarmplay config — see `docs/design/seed-idle-policy.md`.)

## Process

12. **Spinoff when identity diverges.** When the product is no longer “*arr →
    STRM → HTTP,” a new tree (and later a new repo) is healthier than bending
    strmarr conventions. This tree already moved from
    `strmarr/experimental/swarmplay/` to a **sibling** `swarmplay/` root.
