# Torznab secret proxy (P3-04)

## Boundary

Swarmplay remains one Jellyfin plugin per ADR-004: injected pane JavaScript
calls only authenticated Swarmplay plugin endpoints. It never receives, stores,
logs, or constructs Torznab URLs, API keys, or credentials.

The C# plugin server reads configured indexer endpoints and performs every
Torznab request. It returns only normalized release fields needed by the pane
(title, size, seeders, published time, and magnet); strip upstream headers,
error bodies, and URLs.

## Upstream allowlist

- Treat each configured indexer base URL as an exact, administrator-approved
  origin; do not accept an arbitrary URL, host, redirect target, or path from
  the browser.
- Permit only `https` (or explicit local `http` for an administrator-managed
  LAN indexer), known Torznab search paths, bounded query parameters, and
  short timeouts/response limits.
- Resolve and validate the target before connecting; reject loopback,
  link-local, private, multicast, unspecified, and metadata-service addresses
  unless the administrator explicitly enables a LAN indexer.
- Disable automatic redirects, or revalidate every redirect against the same
  allowlist. Never forward browser-supplied headers or cookies upstream.

## Bind and access

Plugin APIs use Jellyfin's authenticated server route and same-origin client
access; no Torznab proxy listener is exposed separately. If a future listener
is necessary, bind it to `127.0.0.1` by default. LAN binding is opt-in,
authenticated, firewall-restricted, and must not expose configuration or
credential-bearing endpoints.

## SSRF and operational notes

The allowlist is the SSRF control: user title text is data, not a destination.
Recheck DNS results at connect time to reduce DNS-rebinding exposure. Rate-limit
searches, cap result sizes, redact credentials from logs/exceptions, and never
return the configured endpoint to clients. The proxy is a plugin capability,
not a Seerr/Jellyseerr service, preserving ADR-004's one-product boundary.
