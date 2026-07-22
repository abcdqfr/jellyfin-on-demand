// Standalone unit tests for mkv_probe.{h,cpp} (ADR-007).
//
// Deliberately dependency-free (no gtest, no libtorrent): links only against
// mkv_probe.cpp so it can run without a torrent session. Hand-builds
// synthetic EBML/Matroska byte buffers with a tiny test-only writer below,
// then exercises parse_head()/find_cues() against them, including the exact
// forensic shapes from strmarr's Tensura cold-gate incident
// (docs/issues/tensura-first-play-cold-gate.md): Cues past a naive small
// tail window, and a false-positive Cues-ID match that must not be treated
// as terminal failure.

#include "mkv_probe.h"

#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

namespace {

using swarmplay::mkv::CueProbeResult;
using swarmplay::mkv::HeadProbeResult;
using swarmplay::mkv::find_cues;
using swarmplay::mkv::kElementAttachments;
using swarmplay::mkv::kElementCluster;
using swarmplay::mkv::kElementCueClusterPosition;
using swarmplay::mkv::kElementCuePoint;
using swarmplay::mkv::kElementCues;
using swarmplay::mkv::kElementCueTime;
using swarmplay::mkv::kElementCueTrackPositions;
using swarmplay::mkv::kElementEbmlHeader;
using swarmplay::mkv::kElementInfo;
using swarmplay::mkv::kElementSeekHead;
using swarmplay::mkv::kElementSegment;
using swarmplay::mkv::kElementTrackEntry;
using swarmplay::mkv::kElementTrackNumber;
using swarmplay::mkv::kElementTracks;
using swarmplay::mkv::kElementTrackType;
using swarmplay::mkv::parse_head;

int g_failures = 0;
int g_checks = 0;

void check(bool ok, char const* what, char const* file, int line) {
    ++g_checks;
    if (!ok) {
        ++g_failures;
        std::fprintf(stderr, "FAIL: %s (%s:%d)\n", what, file, line);
    }
}

#define CHECK(cond) check((cond), #cond, __FILE__, __LINE__)

// --- Minimal test-only EBML byte builder --------------------------------
// Not part of the shipped probe; exists purely so these tests can construct
// realistic synthetic MKV fragments without a real muxer.

std::vector<std::uint8_t> encode_id_bytes(std::uint32_t id) {
    int length = 1;
    if (id > 0xFFFFFFu) length = 4;
    else if (id > 0xFFFFu) length = 3;
    else if (id > 0xFFu) length = 2;
    std::vector<std::uint8_t> out(static_cast<std::size_t>(length));
    std::uint32_t value = id;
    for (int i = length - 1; i >= 0; --i) {
        out[static_cast<std::size_t>(i)] = static_cast<std::uint8_t>(value & 0xFFu);
        value >>= 8;
    }
    return out;
}

std::vector<std::uint8_t> encode_size_bytes(std::uint64_t size, int length) {
    std::vector<std::uint8_t> out(static_cast<std::size_t>(length), 0);
    std::uint64_t value = size;
    for (int i = length - 1; i >= 0; --i) {
        out[static_cast<std::size_t>(i)] = static_cast<std::uint8_t>(value & 0xFFu);
        value >>= 8;
    }
    out[0] |= static_cast<std::uint8_t>(0x80u >> (length - 1));
    return out;
}

class Builder {
public:
    std::vector<std::uint8_t> buf;

    void put_id(std::uint32_t id) {
        auto const bytes = encode_id_bytes(id);
        buf.insert(buf.end(), bytes.begin(), bytes.end());
    }

    void put_size(std::uint64_t size, int length) {
        auto const bytes = encode_size_bytes(size, length);
        buf.insert(buf.end(), bytes.begin(), bytes.end());
    }

    void put_uint(std::uint64_t value, int length) {
        std::vector<std::uint8_t> bytes(static_cast<std::size_t>(length));
        for (int i = length - 1; i >= 0; --i) {
            bytes[static_cast<std::size_t>(i)] = static_cast<std::uint8_t>(value & 0xFFu);
            value >>= 8;
        }
        buf.insert(buf.end(), bytes.begin(), bytes.end());
    }

    void put_bytes(std::vector<std::uint8_t> const& data) {
        buf.insert(buf.end(), data.begin(), data.end());
    }

    // Writes ID + a fixed-length size placeholder; returns the size field's
    // offset so end_master() can patch it once the content length is known.
    std::size_t begin_master(std::uint32_t id, int size_length) {
        put_id(id);
        std::size_t const size_pos = buf.size();
        for (int i = 0; i < size_length; ++i) buf.push_back(0);
        return size_pos;
    }

    void end_master(std::size_t size_pos, int size_length) {
        std::uint64_t const content_len =
            buf.size() - (size_pos + static_cast<std::size_t>(size_length));
        auto const encoded = encode_size_bytes(content_len, size_length);
        for (int i = 0; i < size_length; ++i) buf[size_pos + static_cast<std::size_t>(i)] = encoded[static_cast<std::size_t>(i)];
    }
};

// Builds one TrackEntry with TrackNumber=1, TrackType=1 (video).
void put_minimal_track_entry(Builder& b) {
    std::size_t const entry_pos = b.begin_master(kElementTrackEntry, 1);
    b.put_id(kElementTrackNumber);
    b.put_size(1, 1);
    b.put_uint(1, 1);
    b.put_id(kElementTrackType);
    b.put_size(1, 1);
    b.put_uint(1, 1);
    b.end_master(entry_pos, 1);
}

// Builds a full, well-formed minimal MKV head: EBML header + Segment
// (SeekHead, Info -- both skippable filler -- then Tracks with one entry).
Builder build_valid_head() {
    Builder b;
    {
        std::size_t const p = b.begin_master(kElementEbmlHeader, 1);
        b.put_bytes({0x01, 0x02, 0x03, 0x04});
        b.end_master(p, 1);
    }
    std::size_t const segment_pos = b.begin_master(kElementSegment, 8);
    {
        std::size_t const p = b.begin_master(kElementSeekHead, 1);
        b.put_bytes({0xAA, 0xBB});
        b.end_master(p, 1);
    }
    {
        std::size_t const p = b.begin_master(kElementInfo, 1);
        b.put_bytes({0xCC});
        b.end_master(p, 1);
    }
    std::size_t const tracks_pos = b.begin_master(kElementTracks, 2);
    put_minimal_track_entry(b);
    b.end_master(tracks_pos, 2);
    b.end_master(segment_pos, 8);
    return b;
}

std::vector<std::uint8_t> build_cues_element(
    std::vector<std::pair<std::int64_t, std::int64_t>> const& points) {
    Builder b;
    std::size_t const cues_pos = b.begin_master(kElementCues, 4);
    for (auto const& point : points) {
        std::size_t const point_pos = b.begin_master(kElementCuePoint, 2);
        b.put_id(kElementCueTime);
        b.put_size(8, 1);
        b.put_uint(static_cast<std::uint64_t>(point.first), 8);
        std::size_t const track_pos = b.begin_master(kElementCueTrackPositions, 2);
        b.put_id(0xF7); // CueTrack -- not consumed by find_cues, kept for realism.
        b.put_size(1, 1);
        b.put_uint(1, 1);
        b.put_id(kElementCueClusterPosition);
        b.put_size(8, 1);
        b.put_uint(static_cast<std::uint64_t>(point.second), 8);
        b.end_master(track_pos, 2);
        b.end_master(point_pos, 2);
    }
    b.end_master(cues_pos, 4);
    return b.buf;
}

// --- Tests ----------------------------------------------------------------

void test_valid_head_parses() {
    Builder const b = build_valid_head();
    HeadProbeResult const result = parse_head(b.buf.data(), b.buf.size());
    CHECK(result.ok);
    CHECK(result.num_tracks_found == 1);
    CHECK(result.bytes_consumed == static_cast<std::int64_t>(b.buf.size()));
    CHECK(result.segment_offset > 0);
    CHECK(result.segment_offset < static_cast<std::int64_t>(b.buf.size()));
}

void test_truncated_head_is_retryable_not_crash() {
    Builder const full = build_valid_head();
    // Cut off partway through Tracks/TrackEntry, well before it closes.
    std::size_t const cut_at = full.buf.size() - 5;
    std::vector<std::uint8_t> const truncated(full.buf.begin(),
                                               full.buf.begin() + static_cast<long>(cut_at));
    HeadProbeResult const result = parse_head(truncated.data(), truncated.size());
    CHECK(!result.ok); // Retryable: caller should grow the buffer and retry.

    // Also must not crash on a buffer cut before Segment/Tracks even start.
    HeadProbeResult const empty_result = parse_head(truncated.data(), 0);
    CHECK(!empty_result.ok);
    HeadProbeResult const nullptr_result = parse_head(nullptr, 0);
    CHECK(!nullptr_result.ok);
}

// Regression: Tensura AV1 MKV placed real Cues ~2.08 MiB from EOF. A naive
// 1 MiB tail window misses it entirely; a >=2 MiB window finds it.
void test_cues_past_naive_first_guess_window() {
    constexpr std::size_t kMiB = 1024 * 1024;
    auto const cues_bytes = build_cues_element({{1000, 0}, {5000, 4096}});

    std::size_t const front_filler = 40000;
    std::size_t const total_len = static_cast<std::size_t>(2.2 * static_cast<double>(kMiB));
    std::vector<std::uint8_t> tail(total_len, 0x00);
    for (std::size_t i = 0; i < cues_bytes.size(); ++i) {
        tail[front_filler + i] = cues_bytes[i];
    }

    // Distance of the real Cues element from EOF is ~2.06 MiB -- outside a
    // naive 1 MiB tail window.
    std::size_t const distance_from_eof = tail.size() - front_filler;
    CHECK(distance_from_eof > kMiB);

    std::size_t const small_window = kMiB;
    CueProbeResult const missed = find_cues(
        tail.data() + (tail.size() - small_window), small_window,
        static_cast<std::int64_t>(tail.size() - small_window), 0);
    CHECK(!missed.found);

    CueProbeResult const found = find_cues(tail.data(), tail.size(), 0, 0);
    CHECK(found.found);
    CHECK(found.points.size() == 2);
    if (found.points.size() == 2) {
        CHECK(found.points[0].time_ms == 1000);
        CHECK(found.points[0].cluster_position == 0);
        CHECK(found.points[1].time_ms == 5000);
        CHECK(found.points[1].cluster_position == 4096);
    }
}

// Regression: a coincidental 4-byte Cues-ID match that parses to zero valid
// CuePoints (Tensura's header false-positive) must not be treated as
// terminal -- the backward scan keeps going and finds the real element.
void test_false_positive_cues_id_is_skipped() {
    std::vector<std::uint8_t> tail;
    tail.insert(tail.end(), 10, 0x00);

    // False positive near the FRONT: the 4 raw ID bytes followed by a
    // plausible size vint and garbage that contains no CuePoint children.
    tail.push_back(0x1C);
    tail.push_back(0x53);
    tail.push_back(0xBB);
    tail.push_back(0x6B);
    tail.push_back(0x84); // size vint: length 1, value 4.
    tail.insert(tail.end(), {0x00, 0x11, 0x22, 0x33});

    tail.insert(tail.end(), 500, 0x00);

    auto const real_cues = build_cues_element({{2000, 8192}});
    tail.insert(tail.end(), real_cues.begin(), real_cues.end());

    tail.insert(tail.end(), 20, 0x00);

    // A second decoy AFTER the real element, closer to EOF -- the backward
    // scan must try (and reject) this one before reaching the real Cues.
    tail.push_back(0x1C);
    tail.push_back(0x53);
    tail.push_back(0xBB);
    tail.push_back(0x6B);
    tail.push_back(0x80); // size vint: length 1, value 0 -> empty content.
    tail.insert(tail.end(), 20, 0x00);

    CueProbeResult const result = find_cues(tail.data(), tail.size(), 0, 0);
    CHECK(result.found);
    CHECK(result.points.size() == 1);
    if (result.points.size() == 1) {
        CHECK(result.points[0].time_ms == 2000);
        CHECK(result.points[0].cluster_position == 8192);
    }
}

void test_no_cues_at_all_reports_not_found() {
    std::vector<std::uint8_t> tail(2048, 0x00);
    // A decoy that parses structurally but carries zero points -- still
    // must not be reported as a find.
    tail[100] = 0x1C;
    tail[101] = 0x53;
    tail[102] = 0xBB;
    tail[103] = 0x6B;
    tail[104] = 0x80; // size vint: length 1, value 0.

    CueProbeResult const result = find_cues(tail.data(), tail.size(), 0, 0);
    CHECK(!result.found);
    CHECK(result.points.empty());

    // Buffer with no 4-byte match whatsoever, and degenerate inputs.
    std::vector<std::uint8_t> const plain(512, 0x42);
    CHECK(!find_cues(plain.data(), plain.size(), 0, 0).found);
    CHECK(!find_cues(nullptr, 0, 0, 0).found);
    CHECK(!find_cues(plain.data(), 0, 0, 0).found);
}


// strmarr headAttachmentsReady: Tracks then a truncated Attachments must NOT
// clear the gate -- grow until font FileData is fully present.
void test_truncated_attachments_after_tracks_is_retryable() {
    Builder b;
    {
        std::size_t const p = b.begin_master(kElementEbmlHeader, 1);
        b.put_bytes({0x01});
        b.end_master(p, 1);
    }
    std::size_t const segment_pos = b.begin_master(kElementSegment, 8);
    std::size_t const tracks_pos = b.begin_master(kElementTracks, 2);
    put_minimal_track_entry(b);
    b.end_master(tracks_pos, 2);
    // Attachments header claiming 64 bytes of content, but only supply 4.
    b.put_id(kElementAttachments);
    b.put_size(64, 1);
    b.put_bytes({0xDE, 0xAD, 0xBE, 0xEF});
    // Leave Segment open/truncated on purpose (no end_master) -- mirrors a
    // short read window mid-Attachments.
    (void)segment_pos;

    HeadProbeResult const result = parse_head(b.buf.data(), b.buf.size());
    CHECK(!result.ok);
}

// Full Attachments after Tracks: bytes_consumed must extend through fonts,
// not stop at Tracks (strmarr BytesRead / extentHeadRequired).
void test_attachments_extend_bytes_consumed() {
    Builder b;
    {
        std::size_t const p = b.begin_master(kElementEbmlHeader, 1);
        b.put_bytes({0x01});
        b.end_master(p, 1);
    }
    std::size_t const segment_pos = b.begin_master(kElementSegment, 8);
    std::size_t const tracks_pos = b.begin_master(kElementTracks, 2);
    put_minimal_track_entry(b);
    b.end_master(tracks_pos, 2);
    std::size_t const tracks_end = b.buf.size();
    std::size_t const att_pos = b.begin_master(kElementAttachments, 2);
    b.put_bytes({0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88}); // stand-in FileData
    b.end_master(att_pos, 2);
    std::size_t const att_end = b.buf.size();
    // Cluster marks end of head region.
    std::size_t const cluster_pos = b.begin_master(kElementCluster, 1);
    b.put_bytes({0x00});
    b.end_master(cluster_pos, 1);
    b.end_master(segment_pos, 8);

    HeadProbeResult const result = parse_head(b.buf.data(), b.buf.size());
    CHECK(result.ok);
    CHECK(result.num_tracks_found == 1);
    CHECK(result.bytes_consumed == static_cast<std::int64_t>(att_end));
    CHECK(result.bytes_consumed > static_cast<std::int64_t>(tracks_end));
}

} // namespace

int main() {
    test_valid_head_parses();
    test_truncated_head_is_retryable_not_crash();
    test_truncated_attachments_after_tracks_is_retryable();
    test_attachments_extend_bytes_consumed();
    test_cues_past_naive_first_guess_window();
    test_false_positive_cues_id_is_skipped();
    test_no_cues_at_all_reports_not_found();

    if (g_failures > 0) {
        std::fprintf(stderr, "mkv_probe_test: %d/%d checks FAILED\n",
            g_failures, g_checks);
        return 1;
    }
    std::printf("mkv_probe_test: %d checks passed\n", g_checks);
    return 0;
}
