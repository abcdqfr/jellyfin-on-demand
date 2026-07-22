#include "jellyfin_on_demand_session.h"
#include "mkv_probe.h"

#include <libtorrent/add_torrent_params.hpp>
#include <libtorrent/alert.hpp>
#include <libtorrent/alert_types.hpp>
#include <libtorrent/bencode.hpp>
#include <libtorrent/create_torrent.hpp>
#include <libtorrent/download_priority.hpp>
#include <libtorrent/magnet_uri.hpp>
#include <libtorrent/session.hpp>
#include <libtorrent/session_handle.hpp>
#include <libtorrent/session_status.hpp>
#include <libtorrent/settings_pack.hpp>
#include <libtorrent/torrent_flags.hpp>
#include <libtorrent/torrent_handle.hpp>
#include <libtorrent/torrent_info.hpp>
#include <libtorrent/torrent_status.hpp>

#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <map>
#include <memory>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

namespace {
constexpr int kOk = 0;
constexpr int kInvalidArgument = -2;
constexpr int kMetadataTimeout = -3;
constexpr int kInvalidFileIndex = -4;
constexpr int kIo = -5;
constexpr auto kMetadataTimeoutDuration = std::chrono::seconds(60);

constexpr char const* kDhtBootstrapNodes =
    "router.bittorrent.com:6881,"
    "router.utorrent.com:6881,"
    "dht.transmissionbt.com:6881";

constexpr char const* kDefaultTrackers[] = {
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://tracker.torrent.eu.org:451/announce",
    "udp://open.stealth.si:80/announce",
    "udp://tracker.openbittorrent.com:6969/announce",
    "udp://exodus.desync.com:6969/announce",
};

/* ADR-007: MKV-aware extent gate probe state, cached per (torrent,
 * file_index) `Entry` so parse_head/find_cues run at most once per key. */
enum class MkvProbeState {
    kNotStarted,
    kHeadGrowing,
    kTailGrowing,
    kDone,      /* Structural parse succeeded (head, and cues or cue-less fallback). */
    kSkipped,   /* Not an MKV, or parse_head never succeeded even at full file size. */
};

struct Entry {
    lt::torrent_handle handle;
    std::string path;
    std::vector<lt::piece_index_t> tail_pieces;
    std::vector<lt::piece_index_t> head_pieces;
    std::vector<lt::piece_index_t> warm_pieces; /* tail ∪ head */
    int file_index = 0;
    int head_mib_hint = 32;
    int tail_mib_hint = 8;
    int warm_phase = 0; /* 0=tail, 1=head, 2=done */
    std::vector<lt::piece_index_t> readahead_pieces;
    bool readahead_ready = false; /* initial contiguous window before Play */

    /* ADR-007 probe result/cache -- computed once, then reused as the
     * effective tail_mib_hint/head_mib_hint floors above. */
    MkvProbeState probe_state = MkvProbeState::kNotStarted;
    int head_probe_mib = 1;
    std::int64_t head_required_bytes = 0;
    int cue_probe_mib = 2;
    std::int64_t tail_required_bytes = 0;
    bool cue_found = false;
    bool cue_less_fallback = false;

    /* 0.4 cache-to-library: whole-file download, no warm dance. Populated
     * only by swarm_cache_ensure()'s own keyed entries (never shared with a
     * stream-mode entry for the same torrent). */
    std::vector<lt::piece_index_t> cache_pieces;
};

lt::settings_pack make_session_settings() {
    lt::settings_pack settings = lt::default_settings();
    settings.set_bool(lt::settings_pack::enable_dht, true);
    settings.set_bool(lt::settings_pack::enable_lsd, true);
    settings.set_bool(lt::settings_pack::enable_upnp, true);
    settings.set_bool(lt::settings_pack::enable_natpmp, true);
    settings.set_str(lt::settings_pack::dht_bootstrap_nodes, kDhtBootstrapNodes);
    settings.set_int(lt::settings_pack::alert_mask,
        lt::alert::storage_notification
        | lt::alert::piece_progress_notification
        | lt::alert::status_notification
        | lt::alert::error_notification);

    /* Aggressive time-to-play settings (vlc-bt session.cpp). */
    settings.set_bool(lt::settings_pack::strict_end_game_mode, false);
    settings.set_bool(lt::settings_pack::announce_to_all_trackers, true);
    settings.set_bool(lt::settings_pack::announce_to_all_tiers, true);
    settings.set_int(lt::settings_pack::stop_tracker_timeout, 1);
    settings.set_int(lt::settings_pack::request_timeout, 2);
    settings.set_int(lt::settings_pack::whole_pieces_threshold, 5);
    settings.set_int(lt::settings_pack::request_queue_time, 1);
    settings.set_int(lt::settings_pack::urlseed_pipeline_size, 2);
    settings.set_int(lt::settings_pack::urlseed_max_request_bytes, 100 * 1024);
    return settings;
}

class Session {
public:
    static Session& get() {
        static Session instance;
        return instance;
    }

    lt::session session;
    std::mutex mutex;
    std::map<std::string, Entry> torrents;

private:
    Session()
        : session(make_session_settings())
        , alert_quit_(false)
        , alert_thread_([this] { alert_loop(); }) {}

    ~Session() {
        alert_quit_.store(true);
        if (alert_thread_.joinable()) alert_thread_.join();
    }

    Session(Session const&) = delete;
    Session& operator=(Session const&) = delete;

    void alert_loop() {
        while (!alert_quit_.load(std::memory_order_relaxed)) {
            session.wait_for_alert(std::chrono::seconds(1));
            std::vector<lt::alert*> alerts;
            session.pop_alerts(&alerts);
            for (lt::alert* a : alerts) {
                if (lt::alert_cast<lt::metadata_received_alert>(a) != nullptr) {
                    std::fprintf(stderr, "[jellyfin-on-demand] metadata_received: %s\n",
                        a->message().c_str());
                } else if (lt::alert_cast<lt::metadata_failed_alert>(a) != nullptr) {
                    std::fprintf(stderr, "[jellyfin-on-demand] metadata_failed: %s\n",
                        a->message().c_str());
                } else if (lt::alert_cast<lt::tracker_error_alert>(a) != nullptr) {
                    std::fprintf(stderr, "[jellyfin-on-demand] tracker_error: %s\n",
                        a->message().c_str());
                }
            }
        }
    }

    std::atomic<bool> alert_quit_;
    std::thread alert_thread_;
};

int hex_value(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    return -1;
}

std::string hex_encode(lt::sha1_hash const& hash) {
    static constexpr char digits[] = "0123456789abcdef";
    std::string hex;
    hex.reserve(40);
    for (unsigned char byte : hash) {
        hex.push_back(digits[byte >> 4]);
        hex.push_back(digits[byte & 0x0f]);
    }
    return hex;
}

/// Growing files on real disk (lab: btrfs /home/brandon), never tmpfs /tmp.
/// Override with JELLYFIN_ON_DEMAND_CACHE_DIR (systemd drop-in sets this).
std::filesystem::path cache_root() {
    if (char const* env = std::getenv("JELLYFIN_ON_DEMAND_CACHE_DIR");
        env != nullptr && env[0] != '\0') {
        return std::filesystem::path(env);
    }
    return std::filesystem::path("/home/brandon/cache/jellyfin-on-demand");
}

std::filesystem::path metainfo_dir() {
    return cache_root() / "metainfo";
}

std::filesystem::path metainfo_path_for(std::string const& key) {
    return metainfo_dir() / (key + ".torrent");
}

bool parse_source(char const* source, lt::add_torrent_params& params,
                  std::string& key) {
    if (source == nullptr || *source == '\0') return false;
    std::string const value(source);
    lt::error_code ec;
    if (value.rfind("magnet:?", 0) == 0) {
        params = lt::parse_magnet_uri(value, ec);
        if (ec || !params.info_hashes.has_v1()) return false;
    } else if (std::filesystem::path const source_path(value);
               source_path.is_absolute()
               && source_path.extension() == ".torrent"
               && std::filesystem::is_regular_file(source_path, ec)) {
        params.ti = std::make_shared<lt::torrent_info>(source_path.string(), ec);
        if (ec || !params.ti->info_hashes().has_v1()) return false;
        params.info_hashes = params.ti->info_hashes();
    } else {
        if (value.size() != 40) return false;
        std::array<char, 20> bytes{};
        for (std::size_t i = 0; i < bytes.size(); ++i) {
            int const high = hex_value(value[i * 2]);
            int const low = hex_value(value[i * 2 + 1]);
            if (high < 0 || low < 0) return false;
            bytes[i] = static_cast<char>((high << 4) | low);
        }
        params.info_hashes = lt::info_hash_t(lt::sha1_hash(bytes.data()));
    }
    key = hex_encode(params.info_hashes.v1);
    return true;
}

void ensure_default_trackers(lt::add_torrent_params& params) {
    /* Hash-only / magnet with zero tr= — DHT is not the only path. */
    if (params.ti) return;
    if (!params.trackers.empty()) return;
    for (char const* tracker : kDefaultTrackers) {
        params.trackers.emplace_back(tracker);
    }
}

bool try_load_metainfo_cache(std::string const& key, lt::add_torrent_params& params) {
    std::filesystem::path const path = metainfo_path_for(key);
    std::error_code filesystem_error;
    if (!std::filesystem::is_regular_file(path, filesystem_error)) return false;
    lt::error_code ec;
    auto ti = std::make_shared<lt::torrent_info>(path.string(), ec);
    if (ec || !ti->info_hashes().has_v1()) return false;
    params.ti = std::move(ti);
    params.info_hashes = params.ti->info_hashes();
    return true;
}

void persist_metainfo_cache(std::string const& key,
                            std::shared_ptr<lt::torrent_info const> const& info) {
    if (!info) return;
    std::error_code filesystem_error;
    std::filesystem::create_directories(metainfo_dir(), filesystem_error);
    if (filesystem_error) {
        std::fprintf(stderr, "[jellyfin-on-demand] metainfo cache mkdir failed: %s\n",
            filesystem_error.message().c_str());
        return;
    }

    std::filesystem::path const path = metainfo_path_for(key);
    std::filesystem::path const tmp = path.string() + ".tmp";
    try {
        lt::create_torrent ct(*info);
        lt::entry const entry = ct.generate();
        {
            std::ofstream out(tmp, std::ios::binary | std::ios::trunc);
            if (!out) {
                std::fprintf(stderr, "[jellyfin-on-demand] metainfo cache open failed: %s\n",
                    tmp.c_str());
                return;
            }
            lt::bencode(std::ostream_iterator<char>(out), entry);
            if (!out) {
                std::fprintf(stderr, "[jellyfin-on-demand] metainfo cache write failed: %s\n",
                    tmp.c_str());
                out.close();
                std::filesystem::remove(tmp, filesystem_error);
                return;
            }
        }
        std::filesystem::rename(tmp, path, filesystem_error);
        if (filesystem_error) {
            std::fprintf(stderr, "[jellyfin-on-demand] metainfo cache rename failed: %s\n",
                filesystem_error.message().c_str());
            std::filesystem::remove(tmp, filesystem_error);
            return;
        }
        std::fprintf(stderr, "[jellyfin-on-demand] metainfo cached: %s\n", path.c_str());
    } catch (std::exception const& ex) {
        std::fprintf(stderr, "[jellyfin-on-demand] metainfo cache exception: %s\n", ex.what());
        std::filesystem::remove(tmp, filesystem_error);
    } catch (...) {
        std::filesystem::remove(tmp, filesystem_error);
    }
}

bool wait_for_metadata(lt::torrent_handle const& handle) {
    auto const deadline = std::chrono::steady_clock::now() + kMetadataTimeoutDuration;
    while (!handle.torrent_file()) {
        if (std::chrono::steady_clock::now() >= deadline) return false;
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
    return true;
}

/// Add torrent or reuse existing handle. Caller must hold session.mutex.
lt::torrent_handle add_or_get_locked(Session& session, std::string const& key,
                                     lt::add_torrent_params params,
                                     std::filesystem::path const& save_path,
                                     int* io_error) {
    auto existing = session.torrents.find(key);
    if (existing != session.torrents.end()) {
        return existing->second.handle;
    }

    try_load_metainfo_cache(key, params);
    ensure_default_trackers(params);

    std::error_code filesystem_error;
    std::filesystem::create_directories(save_path, filesystem_error);
    if (filesystem_error) {
        if (io_error != nullptr) *io_error = kIo;
        return {};
    }

    params.save_path = save_path.string();
    return session.session.add_torrent(params);
}

constexpr std::int64_t kMiB = 1024 * 1024;
/* strmarr DefaultExtentHeadFloor / minWarmupBytes — 32MiB/5% starved cold packs. */
constexpr std::int64_t kWarmFloorBytes = 8 * kMiB;
constexpr auto kWarmBlockTimeout = std::chrono::seconds(180);
/* Hotfix (regression): the post-tail+head readahead window used to be sized
 * in *pieces* ("+48"), which silently ballooned into hundreds of MiB on
 * torrents with a large piece_length (auto-selected by libtorrent for big
 * files) -- Play stayed blocked far longer than the pre-blazing-ahead-fix
 * baseline. Bound it in bytes instead so it stays a small, predictable
 * streaming buffer regardless of piece_length. */
constexpr std::int64_t kReadaheadFloorBytes = 24 * kMiB;

std::int64_t warm_band_bytes(std::int64_t file_length, int mib_hint) {
    std::int64_t floor_bytes = kWarmFloorBytes;
    if (mib_hint > 0) {
        floor_bytes = std::max<std::int64_t>(std::int64_t(mib_hint) * kMiB, kWarmFloorBytes);
    }
    if (file_length > 0 && floor_bytes > file_length) return file_length;
    return floor_bytes;
}

bool pieces_complete(lt::torrent_handle const& handle,
                     std::vector<lt::piece_index_t> const& pieces) {
    if (pieces.empty()) return true;
    return std::all_of(pieces.begin(), pieces.end(),
        [&handle](lt::piece_index_t piece) { return handle.have_piece(piece); });
}

void force_piece_deadlines(lt::torrent_handle const& handle,
                           std::vector<lt::piece_index_t> const& pieces) {
    int rank = 0;
    for (auto piece : pieces) {
        /* 0 = highest urgency; stagger slightly so the swarm walks the band. */
        handle.set_piece_deadline(piece, rank * 10);
        ++rank;
    }
}

void set_piece_range_priority(
    std::vector<std::pair<lt::piece_index_t, lt::download_priority_t>>& priorities,
    int first_piece, int first, int last, lt::download_priority_t priority) {
    if (first > last) return;
    for (int piece = first; piece <= last; ++piece) {
        priorities.emplace_back(lt::piece_index_t(first_piece + piece), priority);
    }
}

void compute_warm_bands(lt::torrent_info const& info, int file_index,
                        int tail_mib, int head_mib,
                        int& first_piece, int& piece_count,
                        int& tail_start, int& head_end,
                        std::vector<lt::piece_index_t>& tail_pieces,
                        std::vector<lt::piece_index_t>& head_pieces) {
    auto const& files = info.files();
    auto const index = lt::file_index_t(file_index);
    std::int64_t const file_length = files.file_size(index);
    std::int64_t const file_offset = files.file_offset(index);
    int const piece_length = info.piece_length();
    piece_count = (file_length <= 0) ? 0
        : static_cast<int>((file_length + piece_length - 1) / piece_length);
    first_piece = static_cast<int>(file_offset / piece_length);

    std::int64_t const tail_bytes = warm_band_bytes(file_length, tail_mib);
    std::int64_t const head_bytes = warm_band_bytes(file_length, head_mib);
    int const tail_n = std::min(piece_count,
        static_cast<int>((tail_bytes + piece_length - 1) / piece_length));
    int const head_n = std::min(piece_count,
        static_cast<int>((head_bytes + piece_length - 1) / piece_length));
    tail_start = piece_count - tail_n;
    head_end = std::min(head_n - 1, tail_start - 1);

    tail_pieces.clear();
    head_pieces.clear();
    for (int p = tail_start; p < piece_count; ++p) {
        tail_pieces.push_back(lt::piece_index_t(first_piece + p));
    }
    for (int p = 0; p <= head_end; ++p) {
        head_pieces.push_back(lt::piece_index_t(first_piece + p));
    }
}

/* --- ADR-007: MKV-aware extent gate ------------------------------------
 *
 * `tail_mib`/`head_mib` passed into swarm_ensure are now *floors*, not fixed
 * sizes: before begin_warm() sets up the real tail->head->sequential warm
 * priorities, resolve_mkv_extents() runs a bounded, structurally-verified
 * probe (parse_head/find_cues from mkv_probe.h) and grows the effective
 * tail/head bands to whatever the container actually needs (head: parsed
 * Tracks size, never less than the floor; tail: the window containing a
 * real Cues element, capped at 16 MiB, cue-less fallback bounded at the
 * same cap). Non-MKV files, or any MKV whose head never parses even at full
 * file size, keep today's fixed-floor behavior unchanged.
 *
 * This runs synchronously to completion inline (an "inline sub-loop", per
 * ADR-007's own Consequences section, rather than a fourth warm_phase state
 * advanced across repeated swarm_ensure calls) because the probe windows
 * are tiny relative to the tail/head floors themselves (1 MiB doubling for
 * head, 2->16 MiB for tail) and complete in seconds on real media; it is
 * still bounded by its own sub-deadline so a pathological file can never
 * hang past the outer 180s kWarmBlockTimeout. */

bool is_mkv_path(std::string const& path) {
    if (path.size() < 4) return false;
    std::string ext = path.substr(path.size() - 4);
    for (char& c : ext) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    return ext == ".mkv";
}

/* Reads [start, start+length) directly off disk. The growing torrent file
 * already has real bytes for any piece range that `have_piece()` reports
 * complete -- no new libtorrent read API needed (ADR-007 point 2). */
bool read_file_span(std::string const& path, std::int64_t start, std::int64_t length,
                    std::vector<std::uint8_t>& out) {
    std::ifstream in(path, std::ios::binary);
    if (!in) return false;
    in.seekg(static_cast<std::streamoff>(start), std::ios::beg);
    if (!in) return false;
    out.resize(static_cast<std::size_t>(length));
    in.read(reinterpret_cast<char*>(out.data()), static_cast<std::streamsize>(length));
    std::streamsize const got = in.gcount();
    if (got <= 0) return false;
    out.resize(static_cast<std::size_t>(got));
    return true;
}

/* Warms the first (from_tail=false) or last (from_tail=true) `byte_limit`
 * bytes of `file_index` to piece-complete, releasing `mutex` while waiting.
 * Returns false only on `deadline` timeout. Mirrors the existing
 * force_piece_deadlines/pieces_complete pattern already used for the real
 * tail/head warm bands. */
bool warm_piece_range(std::unique_lock<std::mutex>& lock, lt::torrent_handle handle,
                      lt::torrent_info const& info, int file_index,
                      std::int64_t byte_limit, bool from_tail,
                      std::chrono::steady_clock::time_point deadline) {
    auto const& files = info.files();
    auto const index = lt::file_index_t(file_index);
    std::int64_t const file_length = files.file_size(index);
    std::int64_t const file_offset = files.file_offset(index);
    int const piece_length = info.piece_length();
    if (file_length <= 0 || piece_length <= 0) return true;

    int const first_piece = static_cast<int>(file_offset / piece_length);
    int const piece_count = static_cast<int>((file_length + piece_length - 1) / piece_length);
    std::int64_t const clamped = std::min(byte_limit, file_length);
    int const window_pieces = std::min(piece_count,
        static_cast<int>((clamped + piece_length - 1) / piece_length));

    std::vector<lt::piece_index_t> pieces;
    if (from_tail) {
        int const start = piece_count - window_pieces;
        for (int p = start; p < piece_count; ++p) pieces.push_back(lt::piece_index_t(first_piece + p));
    } else {
        for (int p = 0; p < window_pieces; ++p) pieces.push_back(lt::piece_index_t(first_piece + p));
    }

    int const nfiles = info.files().num_files();
    std::vector<lt::download_priority_t> file_pri(
        static_cast<std::size_t>(nfiles), lt::dont_download);
    if (file_index >= 0 && file_index < nfiles) {
        file_pri[static_cast<std::size_t>(file_index)] = lt::default_priority;
    }
    handle.prioritize_files(file_pri);
    std::vector<std::pair<lt::piece_index_t, lt::download_priority_t>> priorities;
    for (auto piece : pieces) priorities.emplace_back(piece, lt::top_priority);
    handle.prioritize_pieces(priorities);
    force_piece_deadlines(handle, pieces);

    while (!pieces_complete(handle, pieces)) {
        if (std::chrono::steady_clock::now() >= deadline) return false;
        lock.unlock();
        std::this_thread::sleep_for(std::chrono::milliseconds(200));
        lock.lock();
    }
    return true;
}

constexpr std::int64_t kMinCueTailProbeBytes = 2 * kMiB;  /* Tensura miss: 1 MiB was not enough. */
constexpr std::int64_t kMaxCueTailProbeBytes = 16 * kMiB; /* Never read/require more than this. */

/* Runs the growing head/cue probe once for a freshly-created Entry and
 * returns the resolved tail/head MiB floors to hand to begin_warm(). Caller
 * must hold `lock`; it is released/reacquired internally while waiting on
 * pieces. Never throws, never fails open, never widens past the caps above. */
void resolve_mkv_extents(std::unique_lock<std::mutex>& lock, lt::torrent_handle handle,
                         lt::torrent_info const& info, int file_index,
                         std::string const& file_path, int tail_mib_floor,
                         int head_mib_floor, Entry& entry,
                         int& out_tail_mib, int& out_head_mib) {
    out_tail_mib = tail_mib_floor;
    out_head_mib = head_mib_floor;
    entry.probe_state = MkvProbeState::kSkipped;

    try {
        std::int64_t const file_length =
            info.files().file_size(lt::file_index_t(file_index));
        if (file_length <= 0 || !is_mkv_path(file_path)) {
            std::fprintf(stderr, "[jellyfin-on-demand] mkv probe skipped (non-mkv file)\n");
            return;
        }

        auto const probe_deadline = std::chrono::steady_clock::now() + std::chrono::seconds(150);

        /* Head: 1 MiB doubling until parse_head succeeds or file end. */
        entry.probe_state = MkvProbeState::kHeadGrowing;
        std::int64_t head_limit = std::min<std::int64_t>(kMiB, file_length);
        jellyfin_on_demand::mkv::HeadProbeResult head_result;
        for (;;) {
            entry.head_probe_mib = static_cast<int>((head_limit + kMiB - 1) / kMiB);
            if (!warm_piece_range(lock, handle, info, file_index, head_limit,
                                  /*from_tail=*/false, probe_deadline)) {
                std::fprintf(stderr, "[jellyfin-on-demand] mkv head probe timed out; using fixed floor\n");
                return;
            }
            std::vector<std::uint8_t> buf;
            if (!read_file_span(file_path, 0, head_limit, buf)) {
                std::fprintf(stderr, "[jellyfin-on-demand] mkv head probe read failed; using fixed floor\n");
                return;
            }
            head_result = jellyfin_on_demand::mkv::parse_head(buf.data(), buf.size());
            if (head_result.ok) break;
            if (head_limit >= file_length) {
                std::fprintf(stderr,
                    "[jellyfin-on-demand] mkv head probe exhausted file (%lld bytes); using fixed floor\n",
                    static_cast<long long>(file_length));
                return;
            }
            head_limit = std::min(head_limit * 2, file_length);
        }

        std::int64_t const segment_offset = head_result.segment_offset;
        entry.head_required_bytes = std::max<std::int64_t>(head_result.bytes_consumed, kWarmFloorBytes);
        out_head_mib = static_cast<int>((entry.head_required_bytes + kMiB - 1) / kMiB);
        std::fprintf(stderr,
            "[jellyfin-on-demand] mkv head parse OK bytes=%lld tracks=%d segment_offset=%lld head_mib=%d (tracks+attachments)\n",
            static_cast<long long>(head_result.bytes_consumed), head_result.num_tracks_found,
            static_cast<long long>(segment_offset), out_head_mib);

        /* Tail: 2 MiB doubling to a 16 MiB cap, hunting for a real Cues element. */
        entry.probe_state = MkvProbeState::kTailGrowing;
        std::int64_t tail_limit = std::min(kMinCueTailProbeBytes, file_length);
        std::int64_t const tail_cap = std::min(kMaxCueTailProbeBytes, file_length);
        bool cue_found = false;
        for (;;) {
            entry.cue_probe_mib = static_cast<int>((tail_limit + kMiB - 1) / kMiB);
            if (!warm_piece_range(lock, handle, info, file_index, tail_limit,
                                  /*from_tail=*/true, probe_deadline)) {
                std::fprintf(stderr, "[jellyfin-on-demand] mkv cue probe timed out; cue-less fallback\n");
                break;
            }
            std::int64_t const start = file_length - tail_limit;
            std::vector<std::uint8_t> buf;
            if (!read_file_span(file_path, start, tail_limit, buf)) {
                std::fprintf(stderr, "[jellyfin-on-demand] mkv cue probe read failed; cue-less fallback\n");
                break;
            }
            auto const cues = jellyfin_on_demand::mkv::find_cues(buf.data(), buf.size(), start, segment_offset);
            if (cues.found) {
                cue_found = true;
                entry.tail_required_bytes = tail_limit;
                std::fprintf(stderr,
                    "[jellyfin-on-demand] mkv cues found window_mib=%d points=%zu\n",
                    entry.cue_probe_mib, cues.points.size());
                break;
            }
            if (tail_limit >= tail_cap) {
                std::fprintf(stderr,
                    "[jellyfin-on-demand] mkv cues not found within %lld MiB cap; cue-less tail fallback\n",
                    static_cast<long long>(tail_cap / kMiB));
                break;
            }
            tail_limit = std::min(tail_limit * 2, tail_cap);
        }

        entry.cue_found = cue_found;
        entry.cue_less_fallback = !cue_found;
        if (!cue_found) {
            entry.tail_required_bytes = tail_cap;
        }
        out_tail_mib = static_cast<int>((entry.tail_required_bytes + kMiB - 1) / kMiB);
        entry.probe_state = MkvProbeState::kDone;
    } catch (std::exception const& ex) {
        std::fprintf(stderr, "[jellyfin-on-demand] mkv probe exception: %s; using fixed floor\n", ex.what());
        entry.probe_state = MkvProbeState::kSkipped;
    } catch (...) {
        std::fprintf(stderr, "[jellyfin-on-demand] mkv probe unknown exception; using fixed floor\n");
        entry.probe_state = MkvProbeState::kSkipped;
    }

    out_tail_mib = std::max(out_tail_mib, tail_mib_floor > 0 ? tail_mib_floor : 8);
    out_head_mib = std::max(out_head_mib, head_mib_floor > 0 ? head_mib_floor : 8);
}

void apply_tail_phase(lt::torrent_handle const& handle, lt::torrent_info const& info,
                      int file_index, int first_piece, int piece_count,
                      int tail_start) {
    int const nfiles = info.files().num_files();
    std::vector<lt::download_priority_t> file_pri(
        static_cast<std::size_t>(nfiles), lt::dont_download);
    if (file_index >= 0 && file_index < nfiles) {
        file_pri[static_cast<std::size_t>(file_index)] = lt::default_priority;
    }
    handle.prioritize_files(file_pri);

    std::vector<std::pair<lt::piece_index_t, lt::download_priority_t>> priorities;
    set_piece_range_priority(priorities, first_piece, 0, piece_count - 1, lt::dont_download);
    set_piece_range_priority(priorities, first_piece, tail_start, piece_count - 1, lt::top_priority);
    handle.prioritize_pieces(priorities);
    handle.unset_flags(lt::torrent_flags::sequential_download);
    std::fprintf(stderr, "[jellyfin-on-demand] warm phase=tail pieces=%d..%d (file_index=%d)\n",
        tail_start, piece_count - 1, file_index);
}

void apply_head_phase(lt::torrent_handle const& handle, int first_piece,
                      int piece_count, int tail_start, int head_end) {
    std::vector<std::pair<lt::piece_index_t, lt::download_priority_t>> priorities;
    set_piece_range_priority(priorities, first_piece, 0, piece_count - 1, lt::dont_download);
    set_piece_range_priority(priorities, first_piece, tail_start, piece_count - 1, lt::top_priority);
    set_piece_range_priority(priorities, first_piece, 0, head_end, lt::top_priority);
    handle.prioritize_pieces(priorities);
    handle.unset_flags(lt::torrent_flags::sequential_download);
    std::fprintf(stderr, "[jellyfin-on-demand] warm phase=head pieces=0..%d\n", head_end);
}

void apply_sequential_phase(lt::torrent_handle const& handle, int first_piece,
                            int piece_count, int tail_start, int head_end,
                            int piece_length, Entry& entry) {
    /* After head+tail warm, Cues make the file seekable into holes. Prefer a
     * deadline-backed readahead window from the file start (strmarr-style
     * streaming urgency) instead of marking the whole file equal-priority —
     * that let Direct Play skip through sparse middle clusters ("blazing ahead").
     * Gate Play on this window completing (warm_complete), then slide it.
     *
     * Bounded in *bytes* (kReadaheadFloorBytes), not a fixed piece count --
     * a fixed "+48 pieces" balloons into hundreds of MiB when piece_length
     * is large (regression fixed alongside this comment). */
    int const readahead_extra_pieces = piece_length > 0
        ? static_cast<int>((kReadaheadFloorBytes + piece_length - 1) / piece_length)
        : 1;
    /* Prefix = actual head pieces only — never force an 8-piece floor (same
     * class of piece-count balloon as the old "+48" on large piece_length). */
    int const head_prefix = std::max(0, head_end + 1);
    int const readahead = std::min(piece_count, head_prefix + readahead_extra_pieces);
    std::vector<std::pair<lt::piece_index_t, lt::download_priority_t>> priorities;
    set_piece_range_priority(priorities, first_piece, 0, piece_count - 1, lt::low_priority);
    set_piece_range_priority(priorities, first_piece, tail_start, piece_count - 1, lt::top_priority);
    set_piece_range_priority(priorities, first_piece, 0, readahead - 1, lt::top_priority);
    handle.prioritize_pieces(priorities);
    handle.set_flags(lt::torrent_flags::sequential_download);
    entry.readahead_pieces.clear();
    entry.readahead_pieces.reserve(static_cast<std::size_t>(readahead));
    for (int p = 0; p < readahead; ++p) {
        entry.readahead_pieces.push_back(lt::piece_index_t(first_piece + p));
    }
    entry.readahead_ready = false;
    force_piece_deadlines(handle, entry.readahead_pieces);
    std::fprintf(stderr,
        "[jellyfin-on-demand] warm phase=sequential (tail+head ready) readahead_pieces=%d\n",
        readahead);
}

void begin_warm(lt::torrent_handle const& handle, lt::torrent_info const& info,
                int file_index, int tail_mib, int head_mib, Entry& entry) {
    int first_piece = 0;
    int piece_count = 0;
    int tail_start = 0;
    int head_end = -1;
    compute_warm_bands(info, file_index, tail_mib, head_mib,
        first_piece, piece_count, tail_start, head_end,
        entry.tail_pieces, entry.head_pieces);
    entry.file_index = file_index;
    entry.head_mib_hint = head_mib > 0 ? head_mib : 8;
    entry.warm_phase = 0;
    entry.readahead_pieces.clear();
    entry.readahead_ready = false;
    entry.warm_pieces.clear();
    entry.warm_pieces.insert(entry.warm_pieces.end(),
        entry.tail_pieces.begin(), entry.tail_pieces.end());
    entry.warm_pieces.insert(entry.warm_pieces.end(),
        entry.head_pieces.begin(), entry.head_pieces.end());
    apply_tail_phase(handle, info, file_index, first_piece, piece_count, tail_start);
    force_piece_deadlines(handle, entry.tail_pieces);
}

void advance_warm(Entry& entry) {
    auto const info = entry.handle.torrent_file();
    if (!info) return;
    if (entry.tail_pieces.empty() && entry.head_pieces.empty()) {
        entry.warm_phase = 2;
        entry.readahead_ready = true;
        return;
    }

    int first_piece = 0;
    int piece_count = 0;
    int tail_start = 0;
    int head_end = -1;
    std::vector<lt::piece_index_t> ignored_tail;
    std::vector<lt::piece_index_t> ignored_head;
    compute_warm_bands(*info, entry.file_index, entry.tail_mib_hint, entry.head_mib_hint,
        first_piece, piece_count, tail_start, head_end, ignored_tail, ignored_head);

    if (entry.warm_phase >= 2) {
        /* Slide deadline window from the first missing piece so Direct Play
         * keeps a dense prefix ahead of the decoder instead of racing into holes. */
        if (piece_count <= 0) return;
        int first_missing = piece_count;
        for (int p = 0; p < piece_count; ++p) {
            if (!entry.handle.have_piece(lt::piece_index_t(first_piece + p))) {
                first_missing = p;
                break;
            }
        }
        if (first_missing >= piece_count) return;
        int const pl = info->piece_length();
        int const slide_extra = pl > 0
            ? static_cast<int>((kReadaheadFloorBytes + pl - 1) / pl)
            : 1;
        int const window_end = std::min(piece_count, first_missing + slide_extra) - 1;
        std::vector<std::pair<lt::piece_index_t, lt::download_priority_t>> priorities;
        set_piece_range_priority(priorities, first_piece, 0, piece_count - 1, lt::low_priority);
        set_piece_range_priority(priorities, first_piece, tail_start, piece_count - 1, lt::top_priority);
        set_piece_range_priority(priorities, first_piece, first_missing, window_end, lt::top_priority);
        entry.handle.prioritize_pieces(priorities);
        std::vector<lt::piece_index_t> window;
        window.reserve(static_cast<std::size_t>(window_end - first_missing + 1));
        for (int p = first_missing; p <= window_end; ++p) {
            window.push_back(lt::piece_index_t(first_piece + p));
        }
        force_piece_deadlines(entry.handle, window);
        return;
    }
    if (entry.warm_phase == 0) {
        if (!pieces_complete(entry.handle, entry.tail_pieces)) return;
        entry.warm_phase = 1;
        apply_head_phase(entry.handle, first_piece, piece_count, tail_start, head_end);
        force_piece_deadlines(entry.handle, entry.head_pieces);
        std::fprintf(stderr, "[jellyfin-on-demand] warm phase=head forced (%zu pieces)\n",
            entry.head_pieces.size());
    }
    if (entry.warm_phase == 1) {
        if (!pieces_complete(entry.handle, entry.head_pieces)) return;
        entry.warm_phase = 2;
        apply_sequential_phase(entry.handle, first_piece, piece_count, tail_start, head_end,
            info->piece_length(), entry);
    }
}

bool warm_complete(Entry& entry) {
    advance_warm(entry);
    if (entry.warm_phase < 2
        || !pieces_complete(entry.handle, entry.tail_pieces)
        || !pieces_complete(entry.handle, entry.head_pieces)) {
        return false;
    }
    if (!entry.readahead_ready) {
        if (!pieces_complete(entry.handle, entry.readahead_pieces)) return false;
        entry.readahead_ready = true;
        std::fprintf(stderr, "[jellyfin-on-demand] warm readahead ready (%zu pieces)\n",
            entry.readahead_pieces.size());
    }
    return true;
}

void set_ensure_error(swarm_ensure_result* out, int error) {
    if (out != nullptr) {
        out->path = nullptr;
        out->ready = 0;
        out->err = error;
    }
}

void clear_status(swarm_status_result* out) {
    if (out == nullptr) return;
    out->ready = 0;
    out->err = kInvalidArgument;
    out->has_metadata = 0;
    out->num_peers = 0;
    out->num_seeds = 0;
    out->dht_nodes = 0;
    out->progress = 0.0f;
}

/* Map key for a cache-to-library entry -- distinct from the plain stream
 * key so a concurrent swarm_ensure() stream of the same torrent is never
 * touched (separate torrent_handle, separate save_path). */
std::string cache_map_key(std::string const& key, int file_index) {
    return key + "-cache-" + std::to_string(file_index);
}

float cache_progress(Entry const& entry) {
    if (entry.cache_pieces.empty()) return 0.0f;
    std::size_t have = 0;
    for (auto piece : entry.cache_pieces) {
        if (entry.handle.have_piece(piece)) ++have;
    }
    return static_cast<float>(have) / static_cast<float>(entry.cache_pieces.size());
}

/* How close is warm_complete() to flipping true -- NOT the same as raw
 * libtorrent torrent_status::progress, which is bytes-done / bytes-wanted
 * and gets a much bigger denominator once the sequential phase widens
 * "wanted" to the whole file (low_priority still counts). A UI progress bar
 * driven by that raw value visibly regresses/jumps around; this tracks the
 * actual gate instead: tail+head (+readahead once phase>=2). */
float warm_progress(Entry const& entry) {
    std::vector<lt::piece_index_t> relevant = entry.warm_pieces; // tail ∪ head
    if (entry.warm_phase >= 2) {
        relevant.insert(relevant.end(), entry.readahead_pieces.begin(), entry.readahead_pieces.end());
    }
    if (relevant.empty()) return 1.0f;
    std::size_t have = 0;
    for (auto piece : relevant) {
        if (entry.handle.have_piece(piece)) ++have;
    }
    return static_cast<float>(have) / static_cast<float>(relevant.size());
}

int session_dht_nodes(Session& session) {
#if TORRENT_ABI_VERSION <= 2
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wdeprecated-declarations"
    int const nodes = session.session.status().dht_nodes;
#pragma GCC diagnostic pop
    return nodes;
#else
    (void)session;
    return 0;
#endif
}
} // namespace

int swarm_ensure(const char* btih_or_magnet, int file_index, int tail_mib,
                 int head_mib, swarm_ensure_result* out) {
    if (out == nullptr || file_index < 0 || tail_mib < 0 || head_mib < 0) {
        set_ensure_error(out, kInvalidArgument);
        return kInvalidArgument;
    }

    lt::add_torrent_params params;
    std::string key;
    if (!parse_source(btih_or_magnet, params, key)) {
        set_ensure_error(out, kInvalidArgument);
        return kInvalidArgument;
    }

    Session& session = Session::get();
    std::unique_lock<std::mutex> lock(session.mutex);
    std::filesystem::path const save_path = cache_root() / key;

    int io_error = 0;
    lt::torrent_handle handle =
        add_or_get_locked(session, key, std::move(params), save_path, &io_error);
    if (io_error != 0) {
        set_ensure_error(out, io_error);
        return io_error;
    }
    if (!handle.is_valid()) {
        set_ensure_error(out, kInvalidArgument);
        return kInvalidArgument;
    }

    /* Release mutex while waiting so other swarm calls are not blocked. */
    lock.unlock();
    if (!wait_for_metadata(handle)) {
        set_ensure_error(out, kMetadataTimeout);
        return kMetadataTimeout;
    }
    lock.lock();

    auto const info = handle.torrent_file();
    if (!info || file_index >= info->files().num_files()) {
        set_ensure_error(out, kInvalidFileIndex);
        return kInvalidFileIndex;
    }

    persist_metainfo_cache(key, info);

    auto existing = session.torrents.find(key);
    if (existing == session.torrents.end()
        || existing->second.file_index != file_index
        || existing->second.tail_pieces.empty()) {
        Entry entry;
        entry.handle = handle;
        entry.path = info->files().file_path(lt::file_index_t(file_index), save_path.string());
        entry.file_index = file_index;

        /* ADR-007: tail_mib/head_mib are floors now -- the MKV probe may
         * grow them (head up to the parsed Tracks size; tail up to the
         * 16 MiB cue cap) before the tail->head->sequential warm begins. */
        int resolved_tail_mib = tail_mib;
        int resolved_head_mib = head_mib;
        resolve_mkv_extents(lock, handle, *info, file_index, entry.path,
            tail_mib, head_mib, entry, resolved_tail_mib, resolved_head_mib);

        begin_warm(handle, *info, file_index, resolved_tail_mib, resolved_head_mib, entry);
        entry.tail_mib_hint = resolved_tail_mib > 0 ? resolved_tail_mib : 8;
        session.torrents[key] = std::move(entry);
    } else {
        existing->second.handle = handle;
        existing->second.path =
            info->files().file_path(lt::file_index_t(file_index), save_path.string());
    }

    /* strmarr PreparePlay: withhold ready until head+tail extents are on disk. */
    auto const deadline = std::chrono::steady_clock::now() + kWarmBlockTimeout;
    while (std::chrono::steady_clock::now() < deadline) {
        auto& stored = session.torrents[key];
        if (warm_complete(stored)) {
            out->path = stored.path.c_str();
            out->ready = 1;
            out->err = kOk;
            std::fprintf(stderr, "[jellyfin-on-demand] extent gate OK (tail+head warm)\n");
            return kOk;
        }
        lock.unlock();
        std::this_thread::sleep_for(std::chrono::milliseconds(200));
        lock.lock();
        if (session.torrents.find(key) == session.torrents.end()) break;
    }

    auto& stored = session.torrents[key];
    out->path = stored.path.c_str();
    out->ready = warm_complete(stored) ? 1 : 0;
    out->err = kOk;
    if (!out->ready) {
        std::fprintf(stderr,
            "[jellyfin-on-demand] extent gate NOT ready (phase=%d tail=%zu head=%zu)\n",
            stored.warm_phase, stored.tail_pieces.size(), stored.head_pieces.size());
    }
    return kOk;
}

int swarm_status(const char* btih, swarm_status_result* out) {
    if (out == nullptr) return kInvalidArgument;
    clear_status(out);

    lt::add_torrent_params params;
    std::string key;
    if (!parse_source(btih, params, key)) {
        return kInvalidArgument;
    }

    Session& session = Session::get();
    std::lock_guard<std::mutex> lock(session.mutex);
    out->dht_nodes = session_dht_nodes(session);

    auto const entry = session.torrents.find(key);
    if (entry == session.torrents.end()) {
        out->err = kInvalidArgument;
        return kInvalidArgument;
    }

    lt::torrent_status const st = entry->second.handle.status();
    out->has_metadata = entry->second.handle.torrent_file() ? 1 : 0;
    out->num_peers = st.num_peers;
    out->num_seeds = st.num_seeds;
    out->ready = warm_complete(entry->second) ? 1 : 0;
    out->progress = out->ready ? 1.0f : warm_progress(entry->second);
    out->err = kOk;
    return kOk;
}

int swarm_stop(const char* btih, int remove_files) {
    lt::add_torrent_params params;
    std::string key;
    if (!parse_source(btih, params, key)) return kInvalidArgument;
    Session& session = Session::get();
    std::lock_guard<std::mutex> lock(session.mutex);
    auto const entry = session.torrents.find(key);
    if (entry == session.torrents.end()) return kInvalidArgument;
    session.session.remove_torrent(entry->second.handle,
        remove_files ? lt::session_handle::delete_files : lt::remove_flags_t{});
    session.torrents.erase(entry);
    return kOk;
}

static std::string json_escape(std::string const& input) {
    std::string out;
    out.reserve(input.size() + 8);
    for (char c : input) {
        switch (c) {
        case '\\': out += "\\\\"; break;
        case '"': out += "\\\""; break;
        case '\n': out += "\\n"; break;
        case '\r': out += "\\r"; break;
        case '\t': out += "\\t"; break;
        default: out.push_back(c); break;
        }
    }
    return out;
}

int swarm_list_files(const char* source, char* json_out, int json_cap) {
    if (json_out == nullptr || json_cap < 3) return kInvalidArgument;
    json_out[0] = '\0';

    lt::add_torrent_params params;
    std::string key;
    if (!parse_source(source, params, key)) return kInvalidArgument;

    Session& session = Session::get();
    std::unique_lock<std::mutex> lock(session.mutex);

    std::filesystem::path const save_path = cache_root() / key;
    int io_error = 0;
    bool const created_new = session.torrents.find(key) == session.torrents.end();
    lt::torrent_handle handle =
        add_or_get_locked(session, key, std::move(params), save_path, &io_error);
    if (io_error != 0) return io_error;
    if (!handle.is_valid()) return kInvalidArgument;

    lock.unlock();
    if (!wait_for_metadata(handle)) return kMetadataTimeout;
    lock.lock();

    auto const info = handle.torrent_file();
    if (!info) return kInvalidArgument;

    persist_metainfo_cache(key, info);

    if (created_new || session.torrents.find(key) == session.torrents.end()) {
        Entry entry;
        entry.handle = handle;
        entry.path = save_path.string();
        session.torrents.emplace(key, std::move(entry));
    }

    std::ostringstream oss;
    oss << '[';
    int const n = info->files().num_files();
    for (int i = 0; i < n; ++i) {
        if (i) oss << ',';
        auto const idx = lt::file_index_t(i);
        auto const path = info->files().file_path(idx);
        auto const size = info->files().file_size(idx);
        oss << "{\"index\":" << i
            << ",\"size\":" << size
            << ",\"path\":\"" << json_escape(path) << "\"}";
    }
    oss << ']';
    std::string const json = oss.str();
    if (static_cast<int>(json.size()) + 1 > json_cap) return kInvalidArgument;
    std::snprintf(json_out, static_cast<size_t>(json_cap), "%s", json.c_str());
    return kOk;
}

/* --- 0.4 cache-to-library --------------------------------------------
 * Whole-file, normal-priority download of exactly one file straight into
 * an operator/library-resolved dest_dir -- no extent-gate/warm dance (that
 * machinery exists to make Direct Play of a *growing* file safe; here we
 * withhold "ready" until the file is completely on disk, so there is
 * nothing to warm). Tracked under its own map key so a concurrent
 * swarm_ensure() stream of the same torrent is untouched. */
int swarm_cache_ensure(const char* btih_or_magnet, int file_index,
                       const char* dest_dir, swarm_ensure_result* out) {
    if (out == nullptr || file_index < 0 || dest_dir == nullptr || dest_dir[0] == '\0') {
        set_ensure_error(out, kInvalidArgument);
        return kInvalidArgument;
    }

    lt::add_torrent_params params;
    std::string key;
    if (!parse_source(btih_or_magnet, params, key)) {
        set_ensure_error(out, kInvalidArgument);
        return kInvalidArgument;
    }
    std::string const cache_key = cache_map_key(key, file_index);

    Session& session = Session::get();
    std::unique_lock<std::mutex> lock(session.mutex);
    std::filesystem::path const save_path(dest_dir);

    int io_error = 0;
    lt::torrent_handle handle =
        add_or_get_locked(session, cache_key, std::move(params), save_path, &io_error);
    if (io_error != 0) {
        set_ensure_error(out, io_error);
        return io_error;
    }
    if (!handle.is_valid()) {
        set_ensure_error(out, kInvalidArgument);
        return kInvalidArgument;
    }

    lock.unlock();
    if (!wait_for_metadata(handle)) {
        set_ensure_error(out, kMetadataTimeout);
        return kMetadataTimeout;
    }
    lock.lock();

    auto const info = handle.torrent_file();
    if (!info || file_index >= info->files().num_files()) {
        set_ensure_error(out, kInvalidFileIndex);
        return kInvalidFileIndex;
    }
    persist_metainfo_cache(cache_key, info);

    int first_piece = 0;
    int piece_count = 0;
    int tail_start = 0;
    int head_end = -1;
    std::vector<lt::piece_index_t> ignored_a;
    std::vector<lt::piece_index_t> ignored_b;
    compute_warm_bands(*info, file_index, 1, 1,
        first_piece, piece_count, tail_start, head_end, ignored_a, ignored_b);

    std::string const file_path =
        info->files().file_path(lt::file_index_t(file_index), save_path.string());

    auto existing = session.torrents.find(cache_key);
    if (existing == session.torrents.end()) {
        Entry entry;
        entry.handle = handle;
        entry.path = file_path;
        entry.file_index = file_index;
        entry.cache_pieces.reserve(static_cast<std::size_t>(piece_count));
        for (int p = 0; p < piece_count; ++p) {
            entry.cache_pieces.push_back(lt::piece_index_t(first_piece + p));
        }
        session.torrents[cache_key] = std::move(entry);
    } else {
        existing->second.handle = handle;
        existing->second.path = file_path;
    }

    /* Target file at normal priority, every other file off -- v0.4 caches
     * exactly one chosen episode/movie file, never a whole batch. */
    int const total_pieces = info->num_pieces();
    std::vector<std::pair<lt::piece_index_t, lt::download_priority_t>> priorities;
    set_piece_range_priority(priorities, 0, 0, total_pieces - 1, lt::dont_download);
    set_piece_range_priority(priorities, first_piece, 0, piece_count - 1, lt::default_priority);
    handle.prioritize_pieces(priorities);

    auto& stored = session.torrents[cache_key];
    bool const complete = pieces_complete(stored.handle, stored.cache_pieces);
    out->path = stored.path.c_str();
    out->ready = complete ? 1 : 0;
    out->err = kOk;
    std::fprintf(stderr,
        "[jellyfin-on-demand] cache-to-library started file_index=%d dest=%s pieces=%d complete=%d\n",
        file_index, dest_dir, piece_count, complete ? 1 : 0);
    return kOk;
}

int swarm_cache_status(const char* btih_or_magnet, int file_index, swarm_status_result* out) {
    if (out == nullptr) return kInvalidArgument;
    clear_status(out);

    lt::add_torrent_params params;
    std::string key;
    if (!parse_source(btih_or_magnet, params, key)) {
        return kInvalidArgument;
    }
    std::string const cache_key = cache_map_key(key, file_index);

    Session& session = Session::get();
    std::lock_guard<std::mutex> lock(session.mutex);
    out->dht_nodes = session_dht_nodes(session);

    auto const entry = session.torrents.find(cache_key);
    if (entry == session.torrents.end()) {
        out->err = kInvalidArgument;
        return kInvalidArgument;
    }

    lt::torrent_status const st = entry->second.handle.status();
    out->has_metadata = entry->second.handle.torrent_file() ? 1 : 0;
    out->num_peers = st.num_peers;
    out->num_seeds = st.num_seeds;
    out->ready = pieces_complete(entry->second.handle, entry->second.cache_pieces) ? 1 : 0;
    out->progress = out->ready ? 1.0f : cache_progress(entry->second);
    out->err = kOk;
    return kOk;
}
