# Release ranker (I11) — draft weights

**Goal:** Torznab results render as a **short ranked list**; best first;
feeling-lucky = `#1`.

## Inputs (per release)

| Field | Source |
|-------|--------|
| `resolution` | Title parse (2160p/1080p/720p/…) |
| `source` | WEB-DL / BluRay / HDTV / CAM / … |
| `group` | Release group token |
| `seeders` | Torznab |
| `size_bytes` | Torznab |
| `language` / `subs` | Title heuristics |
| `indexer` | Nyaa vs TPB (tie-break only) |
| `query_title` | TMDB/TVDB title for fuzzy match |

## Draft score (higher = better)

```text
score =
  + resolution_pts          # 2160:100, 1080:80, 720:40, 480:10, else:0
  + source_pts               # BluRay:30, WEB-DL/WEBRip:25, HDTV:10, CAM/TS:-50
  + log2(1+seeders) * 8     # soft preference for health
  + size_fit                # 0 if within expected band for res; -20 if tiny/huge outlier
  + lang_pts                # preferred audio/subs: +15; unknown: 0; wrong lang: -10
  + title_similarity * 20   # fuzzy vs TMDB title
  - junk_penalty            # sample/trailer/xxx in name: -100
```

**Feeling lucky:** pick max score; if top two within ε (e.g. 5 pts), prefer higher
seeders then preferred indexer order (Nyaa, TPB).

## Config knobs (plugin settings later)

- Preferred resolution ceiling (e.g. max 1080p on weak clients)
- Preferred languages
- Hard reject: CAM/TS/sample
- Min seeders (strmarr lore default ~3)

## Tests (offline-capable)

Table-driven unit tests: fixture Torznab XML / JSON → ordered list of btihs.
No live indexer required.
