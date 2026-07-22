// Copyright (c) swarmplay contributors.
// O7a Ensure + file list for strmarr-style multi-file pick.
// See docs/design/ensure-ready.md, docs/design/file-index-picker.md

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace Jellyfin.Plugin.Swarmplay.Swarm
{
    public sealed class SwarmEnsureRequest
    {
        public string Btih { get; set; } = string.Empty;
        public string? Magnet { get; set; }
        public int FileIndex { get; set; }
        /// <summary>When set with Episode, auto-pick file_index (strmarr batch intelligence).</summary>
        public int? Season { get; set; }
        public int? Episode { get; set; }
        /// <summary>movie | tv — guides auto file pick when S/E absent.</summary>
        public string? MediaType { get; set; }
        /// <summary>Display name for the virtual Movie item (TMDB title).</summary>
        public string? DisplayName { get; set; }
        public int TailMib { get; set; } = 8;
        public int HeadMib { get; set; } = 8;
        public string WarmOrder { get; set; } = "tail_then_head";
    }

    public sealed class SwarmEnsureResult
    {
        public string? Path { get; set; }
        public bool Ready { get; set; }
        public string? Phase { get; set; }
        /// <summary>Stable machine code (e.g. invalid_argument).</summary>
        public string? Error { get; set; }
        /// <summary>Human-readable explanation for UI toasts.</summary>
        public string? Message { get; set; }
        public int? ErrorCode { get; set; }
    }

    public sealed class SwarmStatusResult
    {
        public string? Path { get; set; }
        public bool Ready { get; set; }
        public string? Phase { get; set; }
        /// <summary>True once libtorrent has torrent_file / metainfo (native has_metadata).</summary>
        public bool HasMetadata { get; set; }
        /// <summary>Connected peers (native num_peers; mirrors Peers for older clients).</summary>
        public int Peers { get; set; }
        public int NumPeers { get; set; }
        public int NumSeeds { get; set; }
        public int DhtNodes { get; set; }
        public double Progress { get; set; }
        public string? Error { get; set; }
        public string? Message { get; set; }
        public int? ErrorCode { get; set; }
    }

    /// <summary>
    /// ASCII-safe magnet for CharSet.Ansi P/Invoke: xt=urn:btih + tr= only (drop dn=/non-ASCII).
    /// </summary>
    public static class MagnetSanitizer
    {
        public static string BuildAsciiMagnet(string? magnetOrBtih, string? knownBtih = null)
        {
            var btih = NormalizeBtih(knownBtih);
            if (btih.Length is not (40 or 32))
            {
                btih = ExtractBtih(magnetOrBtih);
            }

            if (btih.Length is not (40 or 32))
            {
                return string.Empty;
            }

            var sb = new StringBuilder(64);
            sb.Append("magnet:?xt=urn:btih:").Append(btih);
            foreach (var tr in ExtractAsciiTrackerValues(magnetOrBtih))
            {
                sb.Append("&tr=").Append(tr);
            }

            return sb.ToString();
        }

        public static string ExtractBtih(string? magnetOrBtih)
        {
            if (string.IsNullOrWhiteSpace(magnetOrBtih))
            {
                return string.Empty;
            }

            var value = magnetOrBtih.Trim();
            const string marker = "xt=urn:btih:";
            var idx = value.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
            if (idx < 0)
            {
                return NormalizeBtih(value);
            }

            var start = idx + marker.Length;
            var end = start;
            while (end < value.Length)
            {
                var c = value[end];
                if (char.IsLetterOrDigit(c))
                {
                    end++;
                    continue;
                }

                break;
            }

            return NormalizeBtih(value.Substring(start, end - start));
        }

        private static string NormalizeBtih(string? value)
        {
            var hash = (value ?? string.Empty).Trim().ToLowerInvariant();
            return hash.Length is 40 or 32 ? hash : string.Empty;
        }

        private static IEnumerable<string> ExtractAsciiTrackerValues(string? magnet)
        {
            if (string.IsNullOrWhiteSpace(magnet))
            {
                yield break;
            }

            var qIdx = magnet.IndexOf('?');
            var query = qIdx >= 0 ? magnet[(qIdx + 1)..] : magnet;
            foreach (var part in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
            {
                var eq = part.IndexOf('=');
                if (eq <= 0)
                {
                    continue;
                }

                var key = part[..eq];
                if (!key.Equals("tr", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var value = part[(eq + 1)..];
                if (value.Length == 0 || !IsAscii(value))
                {
                    continue;
                }

                yield return value;
            }
        }

        private static bool IsAscii(string value)
        {
            foreach (var c in value)
            {
                if (c > 0x7F)
                {
                    return false;
                }
            }

            return true;
        }
    }

    public sealed class SwarmTorrentFile
    {
        public int Index { get; set; }
        public long Size { get; set; }
        public string Path { get; set; } = string.Empty;
    }

    /// <summary>
    /// Virtual play binding (O6a): ready growing-file Path for Jellyfin MediaSource.
    /// </summary>
    public sealed class SwarmPlayBindResult
    {
        public string VirtualItemKey { get; set; } = string.Empty;
        /// <summary>Real Jellyfin library Guid for PlaybackInfo / PlayNow (O6a).</summary>
        public string? ItemId { get; set; }
        public string Btih { get; set; } = string.Empty;
        public int FileIndex { get; set; }
        public string? Path { get; set; }
        public bool Ready { get; set; }
        public string Protocol { get; set; } = "File";
        public string? Phase { get; set; }
        public string? Error { get; set; }
        public string? Message { get; set; }
        public int? ErrorCode { get; set; }
    }

    public interface ISwarmSession
    {
        Task<SwarmEnsureResult> EnsureAsync(SwarmEnsureRequest request, CancellationToken cancellationToken);
        Task<SwarmStatusResult> StatusAsync(string btih, CancellationToken cancellationToken);
        Task StopAsync(string btih, bool removeFiles, CancellationToken cancellationToken);
        Task<IReadOnlyList<SwarmTorrentFile>> ListFilesAsync(string btihOrMagnet, CancellationToken cancellationToken);
    }

    public sealed class StubSwarmSession : ISwarmSession
    {
        public Task<SwarmEnsureResult> EnsureAsync(SwarmEnsureRequest request, CancellationToken cancellationToken)
        {
            return Task.FromResult(new SwarmEnsureResult
            {
                Path = null,
                Ready = false,
                Phase = "unavailable",
                Error = "native_unavailable",
                Message = "BitTorrent engine is not loaded on this Jellyfin host.",
                ErrorCode = -1
            });
        }

        public Task<SwarmStatusResult> StatusAsync(string btih, CancellationToken cancellationToken)
        {
            return Task.FromResult(new SwarmStatusResult
            {
                Ready = false,
                Phase = "unavailable",
                Error = "native_unavailable",
                Message = "BitTorrent engine is not loaded on this Jellyfin host.",
                ErrorCode = -1
            });
        }

        public Task StopAsync(string btih, bool removeFiles, CancellationToken cancellationToken)
            => Task.CompletedTask;

        public Task<IReadOnlyList<SwarmTorrentFile>> ListFilesAsync(string btihOrMagnet, CancellationToken cancellationToken)
            => Task.FromResult<IReadOnlyList<SwarmTorrentFile>>(System.Array.Empty<SwarmTorrentFile>());
    }

    /// <summary>
    /// English copy for native/session error codes — keep UI and logs aligned.
    /// </summary>
    public static class SwarmErrorText
    {
        public static (string Code, string Message, int? Numeric) Describe(int? code, string? legacy = null)
        {
            if (code is null && string.IsNullOrEmpty(legacy))
            {
                return ("ok", string.Empty, null);
            }

            var n = code;
            if (n is null && !string.IsNullOrEmpty(legacy))
            {
                if (legacy.StartsWith("native_error_", StringComparison.Ordinal)
                    && int.TryParse(legacy.Substring("native_error_".Length), out var parsed))
                {
                    n = parsed;
                }
                else if (legacy is "native_libtorrent_not_wired" or "native_unavailable")
                {
                    n = -1;
                }
            }

            // Legacy clients may still send/store "metadata_timeout" for -3.
            if (string.Equals(legacy, "metadata_timeout", StringComparison.Ordinal)
                || string.Equals(legacy, "metadata_unreachable", StringComparison.Ordinal)
                || string.Equals(legacy, "dead_pin", StringComparison.Ordinal))
            {
                n ??= -3;
            }

            return n switch
            {
                -1 => ("native_unavailable",
                    "BitTorrent engine is not loaded on this Jellyfin host.", n),
                -2 => ("invalid_argument",
                    "Invalid torrent identity — the infohash or magnet was rejected (often a corrupted magnet string). Try another release.", n),
                -3 => ("metadata_unreachable",
                    "Dead pin: could not fetch torrent metadata (no usable peers/trackers answered in time). Try another release or indexer — this is not a player bug.", n),
                -4 => ("invalid_file_index",
                    "That file is not in this torrent (bad file index). Pick another file or release.", n),
                -5 => ("io_error",
                    "Cannot write the swarm cache directory (check SWARMPLAY_CACHE_DIR permissions on disk).", n),
                _ when !string.IsNullOrEmpty(legacy) => (legacy, legacy, n),
                _ => ("error", $"Swarm error{(n is null ? string.Empty : $" ({n})")}.", n)
            };
        }

        public static void Apply(SwarmEnsureResult result)
        {
            if (string.IsNullOrEmpty(result.Error) && result.ErrorCode is null) return;
            var (code, message, n) = Describe(result.ErrorCode, result.Error);
            result.Error = code;
            result.Message = message;
            result.ErrorCode = n;
        }

        public static void Apply(SwarmPlayBindResult result)
        {
            if (string.IsNullOrEmpty(result.Error) && result.ErrorCode is null) return;
            var known = result.Error switch
            {
                "missing_query" => ("missing_query", "Search query is empty."),
                "torznab_empty" => ("torznab_empty", "No Torznab results. Check indexer URLs / Prowlarr, or try a different title."),
                "no_magnet" => ("no_magnet", "Results came back without magnets. Try another indexer or release."),
                "not_ready" => ("not_ready", "Swarm is still warming — not enough of the file is on disk yet to start playback."),
                _ => (null, null)
            };
            if (known.Item1 != null)
            {
                result.Error = known.Item1;
                result.Message = known.Item2;
                return;
            }

            var (code, message, n) = Describe(result.ErrorCode, result.Error);
            result.Error = code;
            result.Message = message;
            result.ErrorCode = n;
        }
    }

    /// <summary>
    /// strmarr-inspired file pick: SxxExx / Season folders, else largest video (skip samples).
    /// </summary>
    public static class FileIndexPicker
    {
        private static readonly Regex SxxExx = new(
            @"(?:^|[\s._-])s(\d{1,2})e(\d{1,3})(?:[\s._-]|$)",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly string[] VideoExt =
        {
            ".mkv", ".mp4", ".avi", ".m4v", ".ts", ".m2ts", ".webm"
        };

        public static int Pick(
            IReadOnlyList<SwarmTorrentFile> files,
            int? season,
            int? episode,
            string? mediaType)
        {
            if (files == null || files.Count == 0) return 0;

            var videos = files
                .Where(f => IsVideo(f.Path) && !IsJunk(f.Path))
                .ToList();
            if (videos.Count == 0) videos = files.ToList();
            if (videos.Count == 1) return videos[0].Index;

            var isMovie = string.Equals(mediaType, "movie", StringComparison.OrdinalIgnoreCase);
            if (!isMovie && season is > 0 && episode is > 0)
            {
                foreach (var f in videos)
                {
                    var m = SxxExx.Match(System.IO.Path.GetFileName(f.Path) ?? f.Path);
                    if (!m.Success) continue;
                    if (int.TryParse(m.Groups[1].Value, out var s)
                        && int.TryParse(m.Groups[2].Value, out var e)
                        && s == season && e == episode)
                    {
                        return f.Index;
                    }
                }

                // Season folder + ordinal episode name fallback: prefer path containing Sxx
                var seasonHint = $"S{season.Value:00}";
                var seasonFiles = videos
                    .Where(f => f.Path.Contains(seasonHint, StringComparison.OrdinalIgnoreCase)
                        || f.Path.Contains($"Season {season}", StringComparison.OrdinalIgnoreCase)
                        || f.Path.Contains($"Season{season}", StringComparison.OrdinalIgnoreCase))
                    .OrderBy(f => f.Path, StringComparer.OrdinalIgnoreCase)
                    .ToList();
                if (seasonFiles.Count >= episode.Value)
                {
                    return seasonFiles[episode.Value - 1].Index;
                }
            }

            // Movie / unknown: largest non-junk video (strmarr “recommended”).
            return videos.OrderByDescending(f => f.Size).First().Index;
        }

        private static bool IsVideo(string path)
        {
            var ext = System.IO.Path.GetExtension(path);
            return VideoExt.Any(v => string.Equals(ext, v, StringComparison.OrdinalIgnoreCase));
        }

        private static bool IsJunk(string path)
        {
            var name = System.IO.Path.GetFileName(path) ?? path;
            return Regex.IsMatch(name, @"\b(sample|trailer|preview|rarbg)\b", RegexOptions.IgnoreCase)
                || name.EndsWith(".nfo", StringComparison.OrdinalIgnoreCase)
                || name.EndsWith(".txt", StringComparison.OrdinalIgnoreCase);
        }
    }
}
