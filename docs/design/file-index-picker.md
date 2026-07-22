**Status:** shipped in **0.3** (episode-in-batch UI + hardened `FileIndexPicker`; [ADR-008](../adr/008-batch-episode-fanout-v0.3.md))

# Multi-file torrent picker

**Scope:** choose one playable torrent file before calling `Ensure`; the chosen
index becomes part of the virtual-item identity.

## Flow

1. After resolving magnet metadata, list files with name, size, and media hint.
2. Hide non-media files by default; offer “Show all files” for subtitles, extras,
   and unknown extensions. Never auto-select `.nfo`, archives, or samples.
3. Preselect the largest likely video file and label it “Recommended.” This is a
   suggestion, not an implicit confirmation.
4. Show a compact picker: filename, size, and a single **Play this file** action.
   On TV, focus the recommended row first; Back returns to release selection.
5. On confirmation, bind the virtual item to `btih + file_index`, then call
   `Ensure({ btih, file_index, warm })`. No `Ensure` occurs while browsing.

## States

- **Resolving files:** show a cancellable “Reading torrent files…” state.
- **No likely media:** show all files; require an explicit selection.
- **Metadata failure:** retain the magnet and offer Retry or Back; do not guess
  `file_index: 0`.
- **Changed selection:** replace the pending virtual-item identity before Ensure;
  a previously prepared different file remains separately addressable.

## Acceptance

- The selected index is passed unchanged to `Ensure`.
- Playback readiness and warm progress apply only to the selected file.
- MVP’s `file_index: 0` default remains only for torrents whose file list has not
  been resolved; this picker supersedes it once metadata is available.
