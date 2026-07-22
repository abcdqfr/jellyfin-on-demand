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
        /// <summary>When true, play-bind keeps FileIndex as sent (episode picker / explicit pick).</summary>
        public bool FileIndexExplicit { get; set; }
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

        /// <summary>
        /// "Stream" side of Add to Library only (stream-bind): the fully-formed,
        /// already-authenticated URL to write into the .strm pointer (client builds
        /// it — same helper used for direct-play links — so the server never has to
        /// mint or extract a user access token).
        /// </summary>
        public string? StreamUrl { get; set; }
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

    /// <summary>
    /// 0.4 cache-to-library: whole-file download bound straight into a real,
    /// already-scanned Jellyfin library (no virtual item, no ephemeral cache).
    /// </summary>
    public sealed class SwarmCacheBindResult
    {
        public string Btih { get; set; } = string.Empty;
        public int FileIndex { get; set; }
        public string? MediaType { get; set; }
        public string? Path { get; set; }
        public bool Ready { get; set; }
        public string? Phase { get; set; }
        public string? Error { get; set; }
        public string? Message { get; set; }
        public int? ErrorCode { get; set; }
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

        /// <summary>0.4 cache-to-library: whole-file download straight into destDir.</summary>
        Task<SwarmEnsureResult> CacheEnsureAsync(
            string btihOrMagnet, int fileIndex, string destDir, CancellationToken cancellationToken);

        Task<SwarmStatusResult> CacheStatusAsync(
            string btihOrMagnet, int fileIndex, CancellationToken cancellationToken);
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

        public Task<SwarmEnsureResult> CacheEnsureAsync(
            string btihOrMagnet, int fileIndex, string destDir, CancellationToken cancellationToken)
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

        public Task<SwarmStatusResult> CacheStatusAsync(
            string btihOrMagnet, int fileIndex, CancellationToken cancellationToken)
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
    /// strmarr-inspired file pick: SxxExx / absolute season nums / Season folders,
    /// else largest video (skip samples + NCOP/NCED extras).
    /// </summary>
    public static class FileIndexPicker
    {
        private static readonly Regex SxxExx = new(
            @"(?:^|[\s._-])s(\d{1,2})e(\d{1,3})(?:[\s._-]|$)",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        // strmarr: Show - 09 / Show - 09v2 (1080p)
        private static readonly Regex ShowDashEp = new(
            @"^(.+?)\s*-\s*(\d{1,3})(?:v\d+)?(?:\s|\(|\[|\.|$)",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        // strmarr: "3rd Season 49" absolute-style
        private static readonly Regex SeasonEpNum = new(
            @"(?:\d{1,2}(?:st|nd|rd|th)\s+Season)\s+(\d{1,3})(?:v\d+)?(?:\s|\[|\.mkv|\.mp4|$)",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex AbsEpisode = new(
            @"(?:^|[\s._-])(\d{1,3})(?:v\d+)?(?:\s*[-–—]|\s*\(|\s*\[|\.mkv|\.mp4|$)",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly string[] VideoExt =
        {
            ".mkv", ".mp4", ".avi", ".m4v", ".ts", ".m2ts", ".webm"
        };

        private sealed class ParsedEp
        {
            public int Index;
            public string Path = string.Empty;
            public long Size;
            public int Season = 1;
            public int Episode;
            public double Confidence;
            public bool SeasonKnown;
        }

        public static int Pick(
            IReadOnlyList<SwarmTorrentFile> files,
            int? season,
            int? episode,
            string? mediaType)
        {
            if (files == null || files.Count == 0) return 0;

            var videos = files
                .Where(f => IsVideo(f.Path) && !IsJunk(f.Path) && !IsSupplementary(f.Path))
                .ToList();
            if (videos.Count == 0)
            {
                videos = files.Where(f => IsVideo(f.Path) && !IsJunk(f.Path)).ToList();
            }

            if (videos.Count == 0) videos = files.ToList();
            if (videos.Count == 1) return videos[0].Index;

            var isMovie = string.Equals(mediaType, "movie", StringComparison.OrdinalIgnoreCase);
            if (!isMovie && season is > 0 && episode is > 0)
            {
                var parsed = videos.Select(ParseOne).ToList();
                NormalizeAbsoluteSeasonEpisodes(parsed);

                foreach (var ep in parsed)
                {
                    if (ep.Episode > 0 && ep.Season == season && ep.Episode == episode)
                    {
                        return ep.Index;
                    }
                }

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

            return videos.OrderByDescending(f => f.Size).First().Index;
        }

        /// <summary>Parse S/E for UI episode lists (same rules as Pick).</summary>
        public static (int? Season, int? Episode, double Confidence) TryParseEpisode(string path)
        {
            var parsed = ParseOne(new SwarmTorrentFile { Path = path ?? string.Empty });
            if (parsed.Episode <= 0) return (null, null, 0);
            return (parsed.Season, parsed.Episode, parsed.Confidence);
        }

        private static ParsedEp ParseOne(SwarmTorrentFile f)
        {
            var path = (f.Path ?? string.Empty).Replace('\\', '/');
            var name = System.IO.Path.GetFileName(path) ?? path;
            var stem = System.IO.Path.GetFileNameWithoutExtension(name) ?? name;
            var parsed = new ParsedEp
            {
                Index = f.Index,
                Path = path,
                Size = f.Size,
                Season = 1,
                SeasonKnown = false
            };

            var seasonFromPath = SeasonFromPath(path);
            if (seasonFromPath > 0)
            {
                parsed.Season = seasonFromPath;
                parsed.SeasonKnown = true;
            }

            var mSeasonEp = SeasonEpNum.Match(stem);
            if (mSeasonEp.Success
                && int.TryParse(mSeasonEp.Groups[1].Value, out var se)
                && se > 0)
            {
                parsed.Episode = se;
                parsed.Confidence = 0.95;
                return parsed;
            }

            var mSxE = SxxExx.Match(name);
            if (mSxE.Success
                && int.TryParse(mSxE.Groups[1].Value, out var s)
                && int.TryParse(mSxE.Groups[2].Value, out var e))
            {
                parsed.Season = s;
                parsed.Episode = e;
                parsed.SeasonKnown = true;
                parsed.Confidence = 1.0;
                return parsed;
            }

            var mDash = ShowDashEp.Match(stem);
            if (mDash.Success
                && int.TryParse(mDash.Groups[2].Value, out var de)
                && de > 0)
            {
                parsed.Episode = de;
                parsed.Confidence = 0.85;
                return parsed;
            }

            var mAbs = AbsEpisode.Match(stem);
            if (mAbs.Success
                && int.TryParse(mAbs.Groups[1].Value, out var ae)
                && ae > 0 && ae < 1000)
            {
                parsed.Episode = ae;
                parsed.Confidence = 0.75;
                return parsed;
            }

            return parsed;
        }

        // strmarr normalizeAbsoluteSeasonEpisodes: "3rd Season 49..72" → relative E01..
        private static void NormalizeAbsoluteSeasonEpisodes(List<ParsedEp> parsed)
        {
            var bySeason = parsed
                .Where(ep => ep.Episode > 0 && ep.Confidence >= 0.75)
                .GroupBy(ep => ep.Season > 0 ? ep.Season : 1);

            foreach (var group in bySeason)
            {
                var idxs = group.ToList();
                if (idxs.Count < 2) continue;
                var minEp = idxs.Min(ep => ep.Episode);
                var maxEp = idxs.Max(ep => ep.Episode);
                if (minEp <= 12) continue;
                var span = maxEp - minEp + 1;
                if (idxs.Count * 2 < span) continue;
                var offset = minEp - 1;
                foreach (var ep in idxs)
                {
                    if (ep.Episode > offset)
                    {
                        ep.Episode -= offset;
                    }
                }
            }
        }

        private static int SeasonFromPath(string path)
        {
            var ord = Regex.Match(path, @"(?i)(\d{1,2})(?:st|nd|rd|th)\s+Season");
            if (ord.Success && int.TryParse(ord.Groups[1].Value, out var s1) && s1 > 0) return s1;
            var folder = Regex.Match(path, @"(?i)(?:^|[/\\])Season\s*(\d{1,2})(?:[/\\]|$)");
            if (folder.Success && int.TryParse(folder.Groups[1].Value, out var s2) && s2 > 0) return s2;
            var shortS = Regex.Match(path, @"(?i)(?:^|[/\\])S(\d{1,2})(?:[/\\]|$)");
            if (shortS.Success && int.TryParse(shortS.Groups[1].Value, out var s3) && s3 > 0) return s3;
            return 0;
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

        private static bool IsSupplementary(string path)
        {
            var u = (path ?? string.Empty).ToUpperInvariant();
            if (u.Contains("/NC/", StringComparison.Ordinal)
                || u.Contains("/EXTRAS/", StringComparison.Ordinal)
                || u.Contains("/BONUS/", StringComparison.Ordinal)
                || u.Contains("/SP/", StringComparison.Ordinal)
                || u.Contains("/PV/", StringComparison.Ordinal)
                || u.Contains("/MENU/", StringComparison.Ordinal))
            {
                return true;
            }

            return u.Contains("NCOP", StringComparison.Ordinal)
                || u.Contains("NCED", StringComparison.Ordinal)
                || u.Contains("NCOV", StringComparison.Ordinal)
                || u.Contains("CREDITLESS", StringComparison.Ordinal);
        }
    }

}
