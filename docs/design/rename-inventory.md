# Rename inventory: JellyfinEnhanced → Jellyfin on Demand

**Do not run a blind mass-rename on cellular without a build.** This inventory
is for Wi‑Fi execution (or careful offline edits + build later).

## High-level targets
| Current | Target |
|---------|--------|
| Assembly / folder `Jellyfin.Plugin.JellyfinEnhanced` | `Jellyfin.Plugin.JellyfinOnDemand` |
| Namespace `Jellyfin.Plugin.JellyfinEnhanced` | `Jellyfin.Plugin.JellyfinOnDemand` |
| Route prefix `/JellyfinEnhanced/` | `/JellyfinOnDemand/` (JS `basePath`, controllers) |
| Global `window.JellyfinEnhanced` / `JE` | Keep `JE` alias **or** `SP` — decide at rename time; `JE` reduces churn |
| manifest `name` | `JellyfinOnDemand` |
| New plugin **guid** | Generate new GUID (do not keep JE’s if publishing side-by-side) |

## Scale (local count)

- ~**124** files under the C# project mentioning `JellyfinEnhanced` /
  `Jellyfin.Plugin.JellyfinEnhanced` (cs/js/html/csproj/json).
- ~**57** `.cs` files with `JellyfinEnhanced`.

## Ordered steps (when building is possible)

1. Change `manifest.json` display strings (safe anytime).
2. Rename `.csproj` + directory; fix project references.
3. Namespace rewrite (IDE or `sed` with verification).
4. Controller routes + script injection paths (`/JellyfinEnhanced/js` → new).
5. Update `plugin.js` `basePath`.
6. Build; fix breakages; smoke-load in JF.

## Offline-safe now

- This inventory.
- Script load gates (Seerr/arr off) — done separately.
- Swarm stubs under new relative paths (`js/swarm/`, `Swarm/`) that won’t
  collide with the old namespace until rename.

## Applied
- P0-09 renamed the plugin source directory and project to `Jellyfin.Plugin.JellyfinOnDemand`.
- C# namespaces and `/JellyfinEnhanced` routes now use `Jellyfin.Plugin.JellyfinOnDemand` and `/JellyfinOnDemand`.
- JavaScript route and script base paths now use `/JellyfinOnDemand`; `window.JellyfinEnhanced` and `JE` remain aliases (P0-09).
- `manifest.json` remains `JellyfinOnDemand` with the existing GUID pending side-by-side publishing.
