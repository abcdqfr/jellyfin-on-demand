#include "swarmplay_session.h"

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

struct Entry {
    lt::torrent_handle handle;
    std::string path;
    std::vector<lt::piece_index_t> warm_pieces;
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
                    std::fprintf(stderr, "[swarmplay] metadata_received: %s\n",
                        a->message().c_str());
                } else if (lt::alert_cast<lt::metadata_failed_alert>(a) != nullptr) {
                    std::fprintf(stderr, "[swarmplay] metadata_failed: %s\n",
                        a->message().c_str());
                } else if (lt::alert_cast<lt::tracker_error_alert>(a) != nullptr) {
                    std::fprintf(stderr, "[swarmplay] tracker_error: %s\n",
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
/// Override with SWARMPLAY_CACHE_DIR (systemd drop-in sets this).
std::filesystem::path cache_root() {
    if (char const* env = std::getenv("SWARMPLAY_CACHE_DIR");
        env != nullptr && env[0] != '\0') {
        return std::filesystem::path(env);
    }
    return std::filesystem::path("/home/brandon/cache/swarmplay");
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
        std::fprintf(stderr, "[swarmplay] metainfo cache mkdir failed: %s\n",
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
                std::fprintf(stderr, "[swarmplay] metainfo cache open failed: %s\n",
                    tmp.c_str());
                return;
            }
            lt::bencode(std::ostream_iterator<char>(out), entry);
            if (!out) {
                std::fprintf(stderr, "[swarmplay] metainfo cache write failed: %s\n",
                    tmp.c_str());
                out.close();
                std::filesystem::remove(tmp, filesystem_error);
                return;
            }
        }
        std::filesystem::rename(tmp, path, filesystem_error);
        if (filesystem_error) {
            std::fprintf(stderr, "[swarmplay] metainfo cache rename failed: %s\n",
                filesystem_error.message().c_str());
            std::filesystem::remove(tmp, filesystem_error);
            return;
        }
        std::fprintf(stderr, "[swarmplay] metainfo cached: %s\n", path.c_str());
    } catch (std::exception const& ex) {
        std::fprintf(stderr, "[swarmplay] metainfo cache exception: %s\n", ex.what());
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

std::vector<lt::piece_index_t> apply_warm_priorities(
    lt::torrent_handle const& handle, lt::torrent_info const& info,
    int file_index, int tail_mib, int head_mib) {
    auto const& files = info.files();
    auto const index = lt::file_index_t(file_index);
    std::int64_t const file_length = files.file_size(index);
    std::int64_t const file_offset = files.file_offset(index);
    int const piece_length = info.piece_length();
    int const piece_count = (file_length <= 0) ? 0
        : static_cast<int>((file_length + piece_length - 1) / piece_length);
    int const tail_pieces = std::min(piece_count,
        std::max(0, tail_mib) * 1024 * 1024 / piece_length + 1);
    int const head_pieces = std::min(piece_count,
        std::max(0, head_mib) * 1024 * 1024 / piece_length + 1);
    int const tail_start = piece_count - tail_pieces;
    int const head_end = std::min(head_pieces - 1, tail_start - 1);
    int const first_piece = static_cast<int>(file_offset / piece_length);

    std::vector<std::pair<lt::piece_index_t, lt::download_priority_t>> priorities;
    std::vector<lt::piece_index_t> warm;
    auto add_range = [&](int first, int last, lt::download_priority_t priority,
                         bool is_warm) {
        for (int piece = first; piece <= last; ++piece) {
            auto const global_piece = lt::piece_index_t(first_piece + piece);
            priorities.emplace_back(global_piece, priority);
            if (is_warm) warm.push_back(global_piece);
        }
    };
    add_range(tail_start, piece_count - 1, lt::top_priority, true);
    add_range(0, head_end, lt::download_priority_t(6), true);
    add_range(head_end + 1, tail_start - 1, lt::default_priority, false);
    handle.prioritize_pieces(priorities);
    handle.set_flags(lt::torrent_flags::sequential_download);
    return warm;
}

bool warm_complete(Entry const& entry) {
    return std::all_of(entry.warm_pieces.begin(), entry.warm_pieces.end(),
        [&entry](lt::piece_index_t piece) { return entry.handle.have_piece(piece); });
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

    Entry entry;
    entry.handle = handle;
    entry.path = info->files().file_path(lt::file_index_t(file_index), save_path.string());
    entry.warm_pieces = apply_warm_priorities(handle, *info, file_index, tail_mib, head_mib);
    session.torrents[key] = std::move(entry);
    auto& stored = session.torrents[key];
    out->path = stored.path.c_str();
    out->ready = warm_complete(stored) ? 1 : 0;
    out->err = kOk;
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
