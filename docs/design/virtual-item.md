# Virtual item (O6a)

## Decision

The Jellyfin on Demand plugin owns the Jellyfin item used for playback. It is virtual:
it represents a selected `btih` and file index, rather than a filesystem
library entity.

- Do not create a `.strm` file.
- Do not create a library-scanner row or a scanner-visible media tree.
- Do not make library identity a prerequisite for playback.
- At play time, expose the selected torrent file as a Jellyfin `MediaSource`
  whose `Path` is the growing local file returned by `Ensure`.

This follows PRODUCT.md's sequential-bytes delivery contract and ADR-002's
O6a decision: virtual items carry a growing-file Path at Play, with no
filesystem library identity.

## Binding

The plugin keeps the play binding with the virtual item (or its short-lived
play-session state):

1. User selects a ranked release or supplies a magnet.
2. The plugin records the immutable media identity: `btih` plus file index.
3. `Ensure(btih, fileIndex)` joins or reuses the in-process swarm and returns
   the growing-file path once it is suitable for Jellyfin to open.
4. The plugin resolves the item's `MediaSource.Path` to that path immediately
   before playback.

The path is an opaque local delivery detail. It is not a durable library path,
and it must not be offered to the library scanner.

## Play / Stop lifecycle

- **Play:** resolve the virtual item → call `Ensure` → wait for its readiness
  decision → set `MediaSource.Path` to the returned growing file → let normal
  Jellyfin/ffmpeg client playback read sequentially.
- **During playback:** the swarm controller continues tail-then-head warming
  and sequential delivery; Jellyfin reads the same growing path.
- **Stop:** detach the Jellyfin play binding; retain or release the swarm using
  the controller's idle/seed policy. Do not promote the file to a library row.
- **Failure:** if `Ensure` cannot provide a ready path, return a playback
  error and leave no scanner-visible artifact behind.

## Boundaries

O6a does not specify torrent transport internals. O7a keeps libtorrent in the
Jellyfin process with a shared session; a later O7b sidecar may preserve this
same virtual-item contract.
