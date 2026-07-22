# torrent — swarm / sequential / warm-lite boundary

Scaffold only. **MVP lean (O7a):** follow
[vlc-bittorrent](https://github.com/johang/vlc-bittorrent) — thin native glue +
**libtorrent-rasterbar** loaded **in the Jellyfin process**, with a shared
`lt::session` for process lifetime (vlc-bt’s `Session::get()` pattern).

**Roadmap (O7b, not MVP):** sidecar `jellyfin-on-demandd`. Cherry-pick strmarr for
cache prefs / seeding / long-lived session examples when that work starts.

## Responsibility

- Add magnet / btih to a session.
- Set **sequential** download for the chosen `file_index`.
- **Warm lite (O3c / I9):** raise priority on **tail M MiB first**, then
  **head N MiB**, then sequential. Tail-before-head keeps the swarm seek-head
  from thrashing (operator requirement). Small fixed floors; fail-open.
  Thesis: ~last 5% then ~first 5% is enough extents for probe/play, then grow.
- Expose the on-disk path for that file (incomplete OK if sequential).
- Do not serve library HTTP; do not speak qBittorrent for *arr.

## Mental model (vlc-bt)

- In-player module, not a separate daemon (MVP).
- Shared session singleton + alert thread.
- Piece priority for warm / sequential; JF reads the growing file (O2a).

## MVP acceptance (prove with tests)

Unit / integration targets against the product in `PRODUCT.md`:

1. `Ensure(btih, file_index)` returns a path.
2. Reading from offset 0 eventually yields media magic bytes without
   downloading the whole torrent first.
3. With O3c enabled, **tail pieces are requested before head pieces**, then
   sequential — before or as play starts.
4. Stopping JF play can leave the torrent seeding or stop — product choice;
   default leave seeding until idle policy exists (see strmarr prior art for
   cache prefs / seeding options).

## Suggested layout (when coding starts)

```text
torrent/
  native/              # C++ (or similar) libtorrent bridge for JF process
  README.md            # this file
  # later (O7b): jellyfin-on-demandd/
```

MVP language: C++ next to libtorrent (vlc-bt shape), exposed to the C# plugin.
O7b language/packaging can diverge later.
