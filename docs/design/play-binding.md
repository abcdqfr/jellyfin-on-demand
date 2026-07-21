# Play binding (P1-05)

## Purpose

Bind a user selection to a virtual Jellyfin item for one playback lifecycle.
The binding owns no library identity and creates no scanner-visible artifact.
See [virtual-item.md](virtual-item.md).

## Sequence

```mermaid
sequenceDiagram
    participant U as User
    participant P as Plugin
    participant S as Swarm controller
    participant J as Jellyfin

    U->>P: select magnet + file index
    P->>P: create/resolve virtual item (btih, file index)
    P->>S: Ensure(btih, fileIndex)
    S-->>P: path, ready state
    alt not ready
        P->>S: wait/poll ready
        S-->>P: ready path
    end
    P->>P: MediaSource.Path = virtual path
    P->>J: Play virtual item
    J->>S: read growing file sequentially
    U->>J: Stop
    J->>P: playback stopped
    P->>S: detach binding; retain or release by idle/seed policy
```

## Contract

1. Pick a magnet/release and selected file index; retain its immutable `btih`
   and `file_index` in short-lived play-session state.
2. Call `Ensure`; it joins or reuses the shared swarm and returns the growing
   local path plus readiness.
3. If `ready` is false, wait or show a spinner. Do not start Jellyfin/ffmpeg
   until readiness permits it; the predicate is defined in
   [ensure-ready.md](ensure-ready.md).
4. Immediately before Play, assign the returned path to the virtual item's
   `MediaSource.Path`, then invoke normal Jellyfin Play.
5. On Stop, detach the binding. Keep seeding until the controller's idle
   policy releases it, or remove it when that policy requires.

The path is an opaque delivery detail: never persist it as a library path,
write a `.strm`, or expose it to the scanner.
