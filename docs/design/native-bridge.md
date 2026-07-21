# Native libtorrent bridge sketch (O7a)

**Prior art (local):** `third-party/vlc-bittorrent/src/session.{h,cpp}`,
`download.cpp`. License GPL-3 — preserve headers if copying
([ATTRIBUTION.md](../../ATTRIBUTION.md)).

## vlc-bt pattern to follow

1. **`Session::get()`** — process-wide shared `lt::session` via `weak_ptr` + mutex.
2. Alert thread: `wait_for_alert` / `pop_alerts` loop.
3. Per-play work registers as alert listener; unregisters on close.
4. Piece priority for demanded ranges (their access module); we instead drive
   **tail → head → sequential** then hand JF a **Path** (O2a).

## Swarmplay MVP shape

```text
Jellyfin.Plugin.Swarmplay (C#)
    P/Invoke or native hosting
        swarmplay_native.so  (C++)
            Session::get()
            Ensure / Status / Stop
```

Suggested layout (when coding starts — do not compile on cellular):

```text
torrent/native/
  include/swarmplay_session.h
  src/session.cpp          # mirror vlc-bt singleton
  src/ensure.cpp           # warm order + path
  CMakeLists.txt           # link libtorrent-rasterbar
```

## C ABI sketch (stable for P/Invoke)

```c
typedef struct { const char *path; int ready; int err; } swarm_ensure_result;

int swarm_ensure(const char *btih_or_magnet, int file_index,
                 int tail_mib, int head_mib, swarm_ensure_result *out);
int swarm_status(const char *btih, /* out fields */);
int swarm_stop(const char *btih, int remove_files);
```

## Offline now / Wi‑Fi later

| Now | Later |
|-----|--------|
| This sketch + Ensure design | `libtorrent-rasterbar-dev`, cmake build |
| Header stubs optional | P/Invoke from plugin |
| Piece-order unit tests as pure logic | Integration against real swarm |

## Do not

- Shell out to random BT CLIs as the lean (O7c rejected).
- Start O7b sidecar before MVP play works.
