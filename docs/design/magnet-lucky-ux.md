# Magnet paste + “I’m feeling lucky” (MVP UX)

**Scope:** one Jellyfin living-room path: paste a magnet or select the top-ranked
release, then bind and play a Jellyfin on Demand **virtual item** (O6a). No `.strm`,
library scan, *arr flow, or HTTP media server.

## Entry

- A title result shows ranked Nyaa/TPB releases, best first, plus **Paste magnet**.
- **I’m feeling lucky** chooses rank #1 immediately. It is disabled until a valid
  ranked result exists; no confirmation screen.
- Paste accepts a `magnet:?` URI only. Validate an `xt=urn:btih:` value locally;
  trim whitespace and show an inline error without making a request when invalid.

## Shared selection flow

1. Resolve the selected magnet's BTIH; default `file_index` to `0`.
2. Create/update the title's virtual item identity as `btih + file_index`; retain
   the magnet as selection metadata, not as a media URL.
3. Open the virtual item's detail/play state: “Preparing swarm…” with Cancel.
4. Call offline-compatible `JE.swarm.ensure({ btih, file_index: 0, warm })`.
   Include `magnet` only when the controller contract accepts it; the current JS
   stub requires `btih` and forwards the request unchanged.
5. If `path` is returned, attach that growing local path to the virtual item.
   `ready: true` starts Jellyfin playback; `ready: false` stays in preparation.
6. Poll `JE.swarm.status(btih)` while preparing. Map `phase` to short copy:
   resolving, warming tail, warming head, then sequential/playable.

## Play, cancel, and retry

- “Play now” is enabled only after `ready`; do not start ffmpeg on `ready: false`.
- Cancel calls `JE.swarm.stop(btih)` and returns to the virtual item detail. The
  default stop behavior leaves seeding to the idle policy.
- `swarm_ensure_unavailable` or `swarm_status_unavailable` is an offline/stub
  state: say “Jellyfin on Demand is not available on this server yet,” offer Retry and
  Back, and never claim playback started.
- Other errors retain the selected virtual item and offer Retry; changing magnet
  creates/selects the identity for its new BTIH.

## Readiness contract

The UI treats `ready` as authoritative. The controller follows the draft
tail-then-head warm order and may become ready through complete warm, readable
head media, or deadline fail-open. Progress is informative, not a substitute for
`ready`.

## MVP acceptance

- Lucky picks rank #1; paste bypasses ranking but uses the same ensure path.
- A multi-file UI can later choose `file_index`; MVP defaults to `0`.
- The visible playable object remains a virtual item bound to `btih + file_index`
  and a growing local file path, satisfying the O6a delivery model.
