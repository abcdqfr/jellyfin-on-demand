#include "swarmplay_session.h"

#include <libtorrent/add_torrent_params.hpp>
#include <libtorrent/download_priority.hpp>
#include <libtorrent/magnet_uri.hpp>
#include <libtorrent/session.hpp>
#include <libtorrent/session_handle.hpp>
#include <libtorrent/settings_pack.hpp>
#include <libtorrent/torrent_flags.hpp>
#include <libtorrent/torrent_handle.hpp>
#include <libtorrent/torrent_info.hpp>

#include <algorithm>
#include <array>
#include <chrono>
#include <cctype>
#include <filesystem>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace {
constexpr int kOk = 0;
constexpr int kInvalidArgument = -2;
constexpr int kMetadataTimeout = -3;
constexpr int kInvalidFileIndex = -4;
constexpr auto kMetadataTimeoutDuration = std::chrono::seconds(5);

struct Entry {
    lt::torrent_handle handle;
    std::string path;
    std::vector<lt::piece_index_t> warm_pieces;
};

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
    Session() : session([] {
        lt::settings_pack settings;
        settings.set_bool(lt::settings_pack::enable_dht, true);
        settings.set_bool(lt::settings_pack::enable_lsd, true);
        settings.set_bool(lt::settings_pack::enable_upnp, true);
        settings.set_bool(lt::settings_pack::enable_natpmp, true);
        return settings;
    }()) {}
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

bool wait_for_metadata(lt::torrent_handle const& handle) {
    auto const deadline = std::chrono::steady_clock::now() + kMetadataTimeoutDuration;
    while (!handle.torrent_file()) {
        if (std::chrono::steady_clock::now() >= deadline) return false;
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
    return true;
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
    std::lock_guard<std::mutex> lock(session.mutex);
    auto existing = session.torrents.find(key);
    if (existing != session.torrents.end()) {
        out->path = existing->second.path.c_str();
        out->ready = warm_complete(existing->second) ? 1 : 0;
        out->err = kOk;
        return kOk;
    }

    std::filesystem::path const save_path =
        std::filesystem::path("/tmp/swarmplay") / key;
    std::error_code filesystem_error;
    std::filesystem::create_directories(save_path, filesystem_error);
    if (filesystem_error) {
        set_ensure_error(out, kInvalidArgument);
        return kInvalidArgument;
    }
    params.save_path = save_path.string();
    lt::torrent_handle const handle = session.session.add_torrent(params);
    if (!wait_for_metadata(handle)) {
        set_ensure_error(out, kMetadataTimeout);
        return kMetadataTimeout;
    }

    auto const info = handle.torrent_file();
    if (!info || file_index >= info->files().num_files()) {
        set_ensure_error(out, kInvalidFileIndex);
        return kInvalidFileIndex;
    }
    Entry entry;
    entry.handle = handle;
    entry.path = info->files().file_path(lt::file_index_t(file_index), save_path.string());
    entry.warm_pieces = apply_warm_priorities(handle, *info, file_index, tail_mib, head_mib);
    auto [inserted, _] = session.torrents.emplace(key, std::move(entry));
    out->path = inserted->second.path.c_str();
    out->ready = warm_complete(inserted->second) ? 1 : 0;
    out->err = kOk;
    return kOk;
}

int swarm_status(const char* btih, swarm_status_result* out) {
    if (out == nullptr) return kInvalidArgument;
    lt::add_torrent_params params;
    std::string key;
    if (!parse_source(btih, params, key)) {
        out->ready = 0;
        out->err = kInvalidArgument;
        return kInvalidArgument;
    }
    Session& session = Session::get();
    std::lock_guard<std::mutex> lock(session.mutex);
    auto const entry = session.torrents.find(key);
    if (entry == session.torrents.end()) {
        out->ready = 0;
        out->err = kInvalidArgument;
        return kInvalidArgument;
    }
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
