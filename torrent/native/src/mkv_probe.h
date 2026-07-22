#ifndef JELLYFIN_ON_DEMAND_MKV_PROBE_H
#define JELLYFIN_ON_DEMAND_MKV_PROBE_H

// Minimal EBML/Matroska structural probe (ADR-007).
//
// Pure functions over in-memory byte buffers only -- no libtorrent, no I/O,
// no third-party MKV parsing library. This header/translation unit must stay
// free of any libtorrent or Go/engine dependency (INVARIANTS.md I8/I10) so it
// can be linked into a standalone unit-test binary and exercised without a
// running torrent session.
//
// Algorithm shape ported (not transliterated) from strmarr's
// engine/subtitles/engine/mkv/{head.go,cues.go} and
// engine/subtitles/engine/{grow.go,cue_probe.go,extent_limits.go} -- see
// docs/adr/007-mkv-aware-extent-gate.md for the full rationale, including the
// Tensura false-positive-Cues-in-header forensic incident this ports lessons
// from.

#include <cstddef>
#include <cstdint>
#include <vector>

namespace jellyfin_on_demand::mkv {

// EBML/Matroska element IDs needed for the head + Cues probe. IDs are kept as
// their raw multi-byte form (including the EBML length-descriptor bits) --
// that is how Matroska element IDs are conventionally written/matched, unlike
// EBML "size" vints where the descriptor bits are stripped.
constexpr std::uint32_t kElementEbmlHeader = 0x1A45DFA3;
constexpr std::uint32_t kElementSegment = 0x18538067;
constexpr std::uint32_t kElementSeekHead = 0x114D9B74;
constexpr std::uint32_t kElementInfo = 0x1549A966;
constexpr std::uint32_t kElementCluster = 0x1F43B675;
constexpr std::uint32_t kElementTracks = 0x1654AE6B;
constexpr std::uint32_t kElementTrackEntry = 0xAE;
constexpr std::uint32_t kElementTrackNumber = 0xD7;
constexpr std::uint32_t kElementTrackType = 0x83;
constexpr std::uint32_t kElementCodecID = 0x86;
constexpr std::uint32_t kElementAttachments = 0x1941A469;
constexpr std::uint32_t kElementAttachedFile = 0x61A7;
constexpr std::uint32_t kElementCues = 0x1C53BB6B;
constexpr std::uint32_t kElementCuePoint = 0xBB;
constexpr std::uint32_t kElementCueTime = 0xB3;
constexpr std::uint32_t kElementCueTrackPositions = 0xB7;
constexpr std::uint32_t kElementCueClusterPosition = 0xF1;

constexpr int kTrackTypeVideo = 1;
constexpr int kTrackTypeSubtitle = 0x11;

// Result of walking the MKV head (EBML header + Segment -> Tracks and
// Attachments) from offset 0 of a buffer.
struct HeadProbeResult {
    bool ok = false;
    std::int64_t bytes_consumed = 0; // Through Tracks + Attachments (strmarr BytesRead).
    std::int64_t segment_offset = 0;
    int num_tracks_found = 0;
};

// Walks top-level elements from offset 0 of `data` looking for Segment ->
// Tracks (at least one valid TrackEntry) and, when present, a complete
// Attachments element (font FileData must be in-buffer -- strmarr
// headAttachmentsReady). Skips SeekHead/Info/etc by declared size; stops at
// Cluster (end of head region). Does not clear ok at Tracks alone.
//
// `ok == false` means "retryable": the buffer ended before Tracks+Attachments
// (or Cluster-after-Tracks) could be confirmed. The caller should grow the
// buffer (double it, per ADR-007) and retry -- this function never throws
// and never reads past `len`.
HeadProbeResult parse_head(const std::uint8_t* data, std::size_t len);

// One Matroska seek-table entry: playback time -> byte offset of the
// containing Cluster, relative to the Segment.
struct CuePoint {
    std::int64_t time_ms = 0;
    std::int64_t cluster_position = 0;
};

struct CueProbeResult {
    bool found = false;
    std::int64_t segment_offset = 0;
    std::vector<CuePoint> points;
};

// Scans `tail_buf` for the 4-byte Cues element ID (0x1C 0x53 0xBB 0x6B) from
// the END of the buffer backward, favoring the right-most (closest to EOF)
// candidate first -- a real Cues element near EOF should win over a
// coincidental 4-byte match earlier in the buffer (the Tensura false-positive
// case: the same 4 bytes appeared inside the EBML header and parsed to an
// empty index).
//
// Each candidate is validated with a bounded EBML sub-parse expecting
// CuePoint -> (CueTime + CueTrackPositions -> CueClusterPosition) children.
// A candidate that parses structurally but yields zero valid CuePoints is
// treated as a false positive, not a fatal error -- scanning continues
// backward toward the front of the buffer. This function does not grow
// anything itself; growth is the caller's loop (see ADR-007 point B).
//
// `tail_start_in_file` is the absolute file offset that `tail_buf[0]`
// corresponds to; it is not required for parsing but is retained for
// caller-side logging/offset math. `segment_offset` seeds the result when the
// Cues element itself carries no nested Segment marker (it never does --
// Segment is a sibling, not a child, of Cues) so callers can compute absolute
// cluster offsets as `segment_offset + cluster_position`.
CueProbeResult find_cues(const std::uint8_t* tail_buf, std::size_t tail_len,
                          std::int64_t tail_start_in_file,
                          std::int64_t segment_offset);

} // namespace jellyfin_on_demand::mkv

#endif // JELLYFIN_ON_DEMAND_MKV_PROBE_H
