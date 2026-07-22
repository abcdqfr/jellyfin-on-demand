#include "mkv_probe.h"

#include <cstdint>
#include <limits>

namespace swarmplay::mkv {

namespace {

constexpr std::uint64_t kUnknownSize = std::numeric_limits<std::uint64_t>::max();

// Number of bytes (1-8) an EBML vint occupies, per the position of the first
// set bit in its leading byte (leading zero bits = length - 1). Returns 0 for
// a leading byte of 0x00, which would require a 9+ byte vint -- unsupported
// (and never seen in real Matroska) here; treated as unparseable.
int vint_length(std::uint8_t first_byte) {
    if (first_byte == 0) return 0;
    for (int i = 0; i < 8; ++i) {
        if (first_byte & (0x80u >> i)) return i + 1;
    }
    return 0;
}

struct Vint {
    std::uint64_t value = 0;
    int length = 0;
    bool ok = false;
};

// Reads an EBML "ID" vint. Matroska element IDs are conventionally matched
// including their length-descriptor bits, so the raw bytes are concatenated
// as-is (not stripped), unlike a "size" vint.
Vint read_element_id(const std::uint8_t* data, std::size_t len, std::size_t pos) {
    Vint result;
    if (data == nullptr || pos >= len) return result;
    int const length = vint_length(data[pos]);
    if (length == 0 || pos + static_cast<std::size_t>(length) > len) return result;
    std::uint64_t value = 0;
    for (int i = 0; i < length; ++i) {
        value = (value << 8) | data[pos + static_cast<std::size_t>(i)];
    }
    result.value = value;
    result.length = length;
    result.ok = true;
    return result;
}

// Reads an EBML "size" vint: the length-descriptor bits are stripped from the
// value. All-1s data bits mean "unknown size" (common for streamed/unfinished
// Segment elements) -- callers must treat that defensively, never as a
// license to read unbounded amounts of data.
Vint read_element_size(const std::uint8_t* data, std::size_t len, std::size_t pos) {
    Vint result;
    if (data == nullptr || pos >= len) return result;
    int const length = vint_length(data[pos]);
    if (length == 0 || pos + static_cast<std::size_t>(length) > len) return result;
    std::uint8_t const first_byte_mask = static_cast<std::uint8_t>(0xFFu >> length);
    std::uint64_t value = data[pos] & first_byte_mask;
    for (int i = 1; i < length; ++i) {
        value = (value << 8) | data[pos + static_cast<std::size_t>(i)];
    }
    std::uint64_t const max_value = (1ULL << (7 * length)) - 1ULL;
    result.value = (value == max_value) ? kUnknownSize : value;
    result.length = length;
    result.ok = true;
    return result;
}

// One EBML element header (ID + size), plus the content span clamped to the
// available buffer.
struct ChildHeader {
    bool ok = false;      // ID + size vints were both fully readable.
    std::uint32_t id = 0;
    std::size_t content_start = 0;
    std::size_t content_end = 0;  // Clamped to `len` when unknown/oversized.
    bool truncated = false;       // Declared size extends past `len`: we do
                                   // not yet have the full element in hand.
    std::size_t next_pos = 0;     // Where a sibling scan continues if this
                                   // element is skipped (only meaningful when
                                   // `!truncated`).
};

ChildHeader read_child_header(const std::uint8_t* data, std::size_t len, std::size_t pos) {
    ChildHeader header;
    Vint const id = read_element_id(data, len, pos);
    if (!id.ok) return header;
    std::size_t const size_pos = pos + static_cast<std::size_t>(id.length);
    Vint const size = read_element_size(data, len, size_pos);
    if (!size.ok) return header;

    header.ok = true;
    header.id = static_cast<std::uint32_t>(id.value);
    header.content_start = size_pos + static_cast<std::size_t>(size.length);

    if (size.value == kUnknownSize) {
        // Defensive: treat unknown size as "rest of buffer" rather than
        // looping forever trying to find a real end.
        header.content_end = len;
        header.truncated = false;
        header.next_pos = len;
        return header;
    }

    std::uint64_t const declared_end =
        static_cast<std::uint64_t>(header.content_start) + size.value;
    if (declared_end > static_cast<std::uint64_t>(len)) {
        header.truncated = true;
        header.content_end = len;
        header.next_pos = len; // Not meaningful while truncated.
    } else {
        header.content_end = static_cast<std::size_t>(declared_end);
        header.truncated = false;
        header.next_pos = header.content_end;
    }
    return header;
}

// Walks TrackEntry children of a (fully-available) Tracks element and
// confirms at least one carries both TrackNumber and TrackType. Returns
// false only when a child header itself could not be read within `len` --
// i.e. genuinely more bytes are needed, not merely "no tracks yet".
bool scan_tracks(const std::uint8_t* data, std::size_t len, std::size_t start,
                  std::size_t end, int& tracks_found) {
    tracks_found = 0;
    std::size_t pos = start;
    while (pos < end) {
        ChildHeader const entry = read_child_header(data, len, pos);
        if (!entry.ok) return false;
        if (entry.id == kElementTrackEntry) {
            if (entry.truncated) return false;
            bool has_number = false;
            bool has_type = false;
            std::size_t sub_pos = entry.content_start;
            while (sub_pos < entry.content_end) {
                ChildHeader const field = read_child_header(data, len, sub_pos);
                if (!field.ok) return false;
                if (field.truncated) return false;
                if (field.id == kElementTrackNumber
                    && field.content_end > field.content_start) {
                    has_number = true;
                } else if (field.id == kElementTrackType
                    && field.content_end > field.content_start) {
                    has_type = true;
                }
                sub_pos = field.next_pos;
            }
            if (has_number && has_type) ++tracks_found;
        } else if (entry.truncated) {
            return false;
        }
        pos = entry.next_pos;
    }
    return true;
}

std::int64_t read_uint(const std::uint8_t* data, std::size_t start, std::size_t end) {
    if (end <= start || end - start > 8) return -1;
    std::uint64_t value = 0;
    for (std::size_t i = start; i < end; ++i) value = (value << 8) | data[i];
    return static_cast<std::int64_t>(value);
}

// Attempts to parse a single Cues candidate at `pos` (already confirmed to
// start with the 4-byte Cues ID). Returns true when the candidate parses
// structurally (a real Cues header was readable) -- `points` may still be
// empty, which callers treat as a false-positive, not an error.
bool parse_cues_candidate(const std::uint8_t* data, std::size_t len, std::size_t pos,
                          std::vector<CuePoint>& points) {
    ChildHeader const cues = read_child_header(data, len, pos);
    if (!cues.ok || cues.id != kElementCues) return false;

    std::size_t child_pos = cues.content_start;
    std::size_t const end = cues.content_end;
    while (child_pos < end) {
        ChildHeader const point = read_child_header(data, len, child_pos);
        if (!point.ok) break; // Ran off the (bounded) window; keep what we have.
        if (point.id == kElementCuePoint) {
            std::int64_t time_ms = -1;
            std::int64_t cluster_position = -1;
            std::size_t sub_pos = point.content_start;
            std::size_t const sub_end = point.content_end;
            while (sub_pos < sub_end) {
                ChildHeader const field = read_child_header(data, len, sub_pos);
                if (!field.ok) break;
                if (field.id == kElementCueTime) {
                    time_ms = read_uint(data, field.content_start, field.content_end);
                } else if (field.id == kElementCueTrackPositions) {
                    std::size_t track_pos = field.content_start;
                    std::size_t const track_end = field.content_end;
                    while (track_pos < track_end) {
                        ChildHeader const track_field = read_child_header(data, len, track_pos);
                        if (!track_field.ok) break;
                        if (track_field.id == kElementCueClusterPosition) {
                            cluster_position = read_uint(
                                data, track_field.content_start, track_field.content_end);
                        }
                        if (track_field.truncated) break;
                        track_pos = track_field.next_pos;
                    }
                }
                if (field.truncated) break;
                sub_pos = field.next_pos;
            }
            if (time_ms >= 0 && cluster_position >= 0) {
                points.push_back(CuePoint{time_ms, cluster_position});
            }
        }
        if (point.truncated) break;
        child_pos = point.next_pos;
    }
    return true;
}

} // namespace

HeadProbeResult parse_head(const std::uint8_t* data, std::size_t len) {
    HeadProbeResult result;
    if (data == nullptr || len == 0) return result;

    // strmarr lesson (extent_gate.headAttachmentsReady + ParseHead BytesRead):
    // Tracks alone is not enough. ASS/SSA clients need font Attachments fully
    // present before play. Do not clear the gate at Tracks -- keep walking
    // Segment children until Attachments is complete, or Cluster marks the
    // end of the head region (no attachments in-header).
    std::size_t pos = 0;
    while (pos < len) {
        ChildHeader const top = read_child_header(data, len, pos);
        if (!top.ok) return result; // Not enough bytes for a header: retryable.

        if (top.id == kElementSegment) {
            result.segment_offset = static_cast<std::int64_t>(top.content_start);
            std::size_t const seg_end = top.content_end; // Clamped defensively.
            std::size_t child_pos = top.content_start;
            bool have_tracks = false;
            std::size_t head_end = 0;
            while (child_pos < seg_end) {
                ChildHeader const child = read_child_header(data, len, child_pos);
                if (!child.ok) {
                    // Mid-header cut after Tracks but before Attachments/Cluster:
                    // grow (retryable). Never clear the gate early.
                    return result;
                }

                if (child.id == kElementTracks) {
                    if (child.truncated) return result;
                    int tracks_found = 0;
                    if (!scan_tracks(data, len, child.content_start, child.content_end,
                                     tracks_found)) {
                        return result;
                    }
                    if (tracks_found > 0) {
                        have_tracks = true;
                        result.num_tracks_found = tracks_found;
                        if (child.content_end > head_end) head_end = child.content_end;
                    }
                    child_pos = child.next_pos;
                    continue;
                }

                if (child.id == kElementAttachments) {
                    // Font FileData lives inside Attachments -- truncated means
                    // fonts are not on disk yet (strmarr headAttachmentsReady).
                    if (child.truncated) return result;
                    if (child.content_end > head_end) head_end = child.content_end;
                    child_pos = child.next_pos;
                    continue;
                }

                if (child.id == kElementCluster) {
                    // Past the head region. Gate clears only if Tracks landed.
                    if (have_tracks) {
                        result.bytes_consumed = static_cast<std::int64_t>(head_end);
                        result.ok = true;
                    }
                    return result;
                }

                // SeekHead, Info, Chapters, Cues, void, etc: skip by size.
                if (child.truncated) return result;
                child_pos = child.next_pos;
            }
            if (have_tracks) {
                result.bytes_consumed = static_cast<std::int64_t>(head_end);
                result.ok = true;
            }
            return result;
        }

        // EBML header (or any other top-level element): skip by declared size.
        if (top.truncated) return result;
        pos = top.next_pos;
    }
    return result; // Exhausted the buffer without ever reaching Segment.
}

CueProbeResult find_cues(const std::uint8_t* tail_buf, std::size_t tail_len,
                          std::int64_t tail_start_in_file,
                          std::int64_t segment_offset) {
    CueProbeResult result;
    result.segment_offset = segment_offset;
    (void)tail_start_in_file; // Retained for caller-side logging/offset math.
    if (tail_buf == nullptr || tail_len < 4) return result;

    constexpr std::uint8_t kCuesId[4] = {0x1C, 0x53, 0xBB, 0x6B};
    std::vector<std::size_t> candidates;
    for (std::size_t i = 0; i + 4 <= tail_len; ++i) {
        if (tail_buf[i] == kCuesId[0] && tail_buf[i + 1] == kCuesId[1]
            && tail_buf[i + 2] == kCuesId[2] && tail_buf[i + 3] == kCuesId[3]) {
            candidates.push_back(i);
        }
    }

    // Favor the right-most (closest to EOF) candidate first -- the real
    // Cues element should win over an earlier coincidental byte match.
    for (auto it = candidates.rbegin(); it != candidates.rend(); ++it) {
        std::vector<CuePoint> points;
        if (!parse_cues_candidate(tail_buf, tail_len, *it, points)) continue;
        if (points.empty()) continue; // False positive (Tensura header hit): keep scanning.
        result.found = true;
        result.points = std::move(points);
        return result;
    }
    return result;
}

} // namespace swarmplay::mkv
