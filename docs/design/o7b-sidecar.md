# O7b: optional sidecar control plane

O7b promotes the in-process swarm session operations to a local HTTP service:

```text
Jellyfin plugin ── HTTP ──> swarmplayd ──> libtorrent session
                    Ensure / Status / Stop
```

## API sketch

- `POST /v1/ensure` — magnet/BTIH, selected file, and warm-range settings;
  returns the playable path and readiness state.
- `GET /v1/status/{btih}` — current download, readiness, and error state.
- `POST /v1/stop/{btih}` — stop a session; explicit option controls file removal.

The HTTP shapes should preserve the semantics of the native
`Ensure` / `Status` / `Stop` interface, so the plugin can select either
in-process or sidecar transport without changing playback flow.

## Binding and authentication

- Bind loopback only (`127.0.0.1` and/or `::1`) by default; never expose the
  control plane on a LAN interface without an explicit future deployment mode.
- Use a per-install random bearer token, stored with restrictive filesystem
  permissions and passed by the plugin on every request.
- Reject missing or invalid tokens before parsing request payloads; do not
  accept browser-originated control requests.
- Keep file paths, magnets, and status details local: no telemetry or remote
  relay belongs in this service.

## Scope

This is not MVP work. MVP keeps the in-process session described by the
[plugin control plane](../../plugin/README.md) and the
[native bridge sketch](native-bridge.md).

When O7b is scheduled, cherry-pick only the relevant session, seed, and cache
patterns indexed in `strmarr-cherry-pick-index.md`; do not transplant a
separate product runtime wholesale.
