using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.Swarmplay.Configuration;
using Jellyfin.Plugin.Swarmplay.Helpers;
using Jellyfin.Plugin.Swarmplay.Swarm;
using Jellyfin.Plugin.Swarmplay.Swarm.Torznab;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Swarmplay.Controllers
{
    [Route("Swarmplay/swarm")]
    [ApiController]
    public class SwarmController : ControllerBase
    {
        private static readonly TimeSpan ReadyTimeout = TimeSpan.FromSeconds(45);
        private static readonly TimeSpan TorznabTimeout = TimeSpan.FromSeconds(20);
        private readonly ISwarmSession _swarmSession;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ILibraryManager _libraryManager;
        private readonly SearchHistoryStore _history;

        public SwarmController(
            ISwarmSession swarmSession,
            IHttpClientFactory httpClientFactory,
            ILibraryManager libraryManager,
            UserConfigurationManager userConfigurationManager)
        {
            _swarmSession = swarmSession;
            _httpClientFactory = httpClientFactory;
            _libraryManager = libraryManager;
            _history = new SearchHistoryStore(userConfigurationManager);
        }

        [HttpPost("ensure")]
        [Authorize]
        public Task<SwarmEnsureResult> Ensure(
            [FromBody] SwarmEnsureRequest request,
            CancellationToken cancellationToken)
        {
            return _swarmSession.EnsureAsync(request, cancellationToken);
        }

        [HttpGet("status")]
        [Authorize]
        public Task<SwarmStatusResult> Status(
            [FromQuery] string btih,
            CancellationToken cancellationToken)
        {
            return _swarmSession.StatusAsync(btih, cancellationToken);
        }

        /// <summary>
        /// Torznab search via configured indexer URLs (server-side only — ADR torznab-proxy).
        /// </summary>
        [HttpGet("torznab/search")]
        [Authorize]
        public async Task<IActionResult> TorznabSearch(
            [FromQuery] string? q,
            CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(q))
            {
                return BadRequest(new { error = true, code = "missing_query", message = "Search query is required." });
            }

            var releases = await SearchConfiguredIndexersAsync(q.Trim(), cancellationToken).ConfigureAwait(false);
            var ranked = RankReleases(releases, q.Trim()).ToList();
            return Ok(new { query = q.Trim(), results = ranked });
        }

        /// <summary>
        /// Feeling-lucky: Torznab → rank #1 (seeders/title) → play-bind (Ensure + wait ready).
        /// </summary>
        [HttpPost("lucky")]
        [Authorize]
        public async Task<ActionResult<SwarmPlayBindResult>> Lucky(
            [FromBody] SwarmLuckyRequest request,
            CancellationToken cancellationToken)
        {
            var query = request?.Query?.Trim() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(query))
            {
                return BadRequest(new SwarmPlayBindResult
                {
                    Ready = false,
                    Phase = "error",
                    Error = "missing_query"
                });
            }

            var releases = await SearchConfiguredIndexersAsync(query, cancellationToken).ConfigureAwait(false);
            var top = RankReleases(releases, query).FirstOrDefault();
            if (top == null || string.IsNullOrWhiteSpace(top.Magnet))
            {
                return Ok(new SwarmPlayBindResult
                {
                    Ready = false,
                    Phase = "error",
                    Error = releases.Count == 0 ? "torznab_empty" : "no_magnet"
                });
            }

            var btih = MagnetSanitizer.ExtractBtih(top.Magnet);
            var ensureRequest = new SwarmEnsureRequest
            {
                // ASCII magnet (xt+tr) so Torznab trackers reach native P/Invoke.
                Magnet = MagnetSanitizer.BuildAsciiMagnet(top.Magnet, btih),
                Btih = btih,
                FileIndex = 0,
                DisplayName = string.IsNullOrWhiteSpace(request?.DisplayName) ? query : request!.DisplayName,
                MediaType = request?.MediaType,
                Season = request?.Season,
                Episode = request?.Episode,
                TailMib = JellyfinEnhanced.Instance?.Configuration?.WarmTailMib > 0
                    ? JellyfinEnhanced.Instance.Configuration.WarmTailMib
                    : 8,
                HeadMib = JellyfinEnhanced.Instance?.Configuration?.WarmHeadMib > 0
                    ? JellyfinEnhanced.Instance.Configuration.WarmHeadMib
                    : 8
            };

            return await PlayBind(ensureRequest, cancellationToken).ConfigureAwait(false);
        }

        /// <summary>
        /// O6a play bind: Ensure → wait ready → return File Path for MediaSource.
        /// Does not create a library/.strm row.
        /// </summary>
        [HttpPost("play-bind")]
        [Authorize]
        public async Task<ActionResult<SwarmPlayBindResult>> PlayBind(
            [FromBody] SwarmEnsureRequest request,
            CancellationToken cancellationToken)
        {
            request ??= new SwarmEnsureRequest();
            var btih = string.IsNullOrWhiteSpace(request.Btih)
                ? MagnetSanitizer.ExtractBtih(request.Magnet)
                : request.Btih.Trim().ToLowerInvariant();
            request.Btih = btih;
            var asciiMagnet = MagnetSanitizer.BuildAsciiMagnet(request.Magnet, btih);
            if (!string.IsNullOrEmpty(asciiMagnet))
            {
                request.Magnet = asciiMagnet;
            }

            // Resolve metadata + file list, then strmarr-style file_index pick.
            // Prefer sanitized magnet (trackers) over bare btih.
            var source = !string.IsNullOrEmpty(request.Magnet)
                ? request.Magnet
                : (btih ?? string.Empty);
            if (!string.IsNullOrEmpty(source)
                && (request.Season is > 0 || request.Episode is > 0
                    || string.Equals(request.MediaType, "movie", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(request.MediaType, "tv", StringComparison.OrdinalIgnoreCase)))
            {
                var files = await _swarmSession.ListFilesAsync(source, cancellationToken).ConfigureAwait(false);
                if (files.Count > 0)
                {
                    request.FileIndex = FileIndexPicker.Pick(files, request.Season, request.Episode, request.MediaType);
                }
            }

            var ensure = await _swarmSession.EnsureAsync(request, cancellationToken).ConfigureAwait(false);
            var ready = ensure.Ready;
            var path = ensure.Path;
            var phase = ensure.Phase;
            var error = ensure.Error;
            var errorCode = ensure.ErrorCode;
            var message = ensure.Message;

            if (!ready && !string.IsNullOrEmpty(btih) && string.IsNullOrEmpty(error))
            {
                var deadline = DateTime.UtcNow + ReadyTimeout;
                while (DateTime.UtcNow < deadline)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    var status = await _swarmSession.StatusAsync(btih, cancellationToken).ConfigureAwait(false);
                    ready = status.Ready;
                    phase = status.Phase;
                    error = status.Error;
                    errorCode = status.ErrorCode;
                    message = status.Message;
                    if (!string.IsNullOrEmpty(status.Path))
                    {
                        path = status.Path;
                    }

                    // strmarr: never fail-open on Length — libtorrent preallocates sparse
                    // full size; only native warm_complete (tail then head) means ready.
                    if (ready || !string.IsNullOrEmpty(error))
                    {
                        break;
                    }

                    await Task.Delay(250, cancellationToken).ConfigureAwait(false);
                }
            }

            if (!ready && string.IsNullOrEmpty(error))
            {
                phase = "warm_timeout";
                error = "extent_warm_timeout";
                message = "Head/tail extents not ready — refusing play (no fail-open on sparse Length).";
            }

            string? itemId = null;
            if (ready && !string.IsNullOrEmpty(path) && !string.IsNullOrEmpty(btih))
            {
                try
                {
                    itemId = await BindVirtualMovieAsync(
                            btih,
                            request.FileIndex,
                            path,
                            request.DisplayName,
                            cancellationToken)
                        .ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    ready = false;
                    error = "virtual_item_bind_failed";
                    message = $"Warm ok but could not create Jellyfin item: {ex.Message}";
                    errorCode = null;
                }
            }

            var bind = new SwarmPlayBindResult
            {
                VirtualItemKey = string.IsNullOrEmpty(btih) ? string.Empty : $"swarm:{btih}:{request.FileIndex}",
                ItemId = itemId,
                Btih = btih ?? string.Empty,
                FileIndex = request.FileIndex,
                Path = path,
                Ready = ready && !string.IsNullOrEmpty(path) && !string.IsNullOrEmpty(itemId),
                Protocol = "File",
                Phase = phase ?? (ready ? "ready" : "error"),
                Error = ready && !string.IsNullOrEmpty(path) && !string.IsNullOrEmpty(itemId)
                    ? null
                    : (error ?? "not_ready"),
                Message = message,
                ErrorCode = errorCode
            };
            SwarmErrorText.Apply(bind);
            return Ok(bind);
        }

        /// <summary>
        /// O6a: mint/update a real Movie Guid whose Path is the growing file so
        /// Desktop PlayNow / PlaybackInfo / ffmpeg transcode work (no DIY player).
        /// </summary>
        private Task<string> BindVirtualMovieAsync(
            string btih,
            int fileIndex,
            string path,
            string? displayName,
            CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var id = SwarmItemId(btih, fileIndex);
            var name = string.IsNullOrWhiteSpace(displayName)
                ? Path.GetFileNameWithoutExtension(path)
                : displayName.Trim();
            if (string.IsNullOrWhiteSpace(name))
            {
                name = $"Swarmplay {btih[..Math.Min(8, btih.Length)]}";
            }

            // Prefer user root so the item is addressable for PlaybackInfo / PlayNow.
            BaseItem parent = _libraryManager.GetUserRootFolder() ?? _libraryManager.RootFolder;
            var existing = _libraryManager.GetItemById(id) as Movie;
            if (existing is null)
            {
                var movie = new Movie
                {
                    Id = id,
                    Name = name,
                    Path = path,
                    IsVirtualItem = true,
                    VideoType = VideoType.VideoFile,
                    ForcedSortName = $"swarmplay-{btih}-{fileIndex}",
                    ParentId = parent.Id
                };
                // CreateItem persists; avoid UpdateItemAsync here (can block on library refresh).
                _libraryManager.CreateItem(movie, parent);
            }
            else
            {
                existing.Name = name;
                existing.Path = path;
                existing.IsVirtualItem = true;
                existing.VideoType = VideoType.VideoFile;
                existing.ParentId = parent.Id;
                // Fire-and-forget metadata edit — path must update for the next PlayNow.
                _ = _libraryManager.UpdateItemAsync(
                    existing,
                    existing.GetParent() ?? parent,
                    ItemUpdateType.MetadataEdit,
                    CancellationToken.None);
            }

            return Task.FromResult(id.ToString("D"));
        }

        private static Guid SwarmItemId(string btih, int fileIndex)
        {
            var bytes = MD5.HashData(Encoding.UTF8.GetBytes($"swarmplay:{btih}:{fileIndex}"));
            return new Guid(bytes);
        }

        [HttpPost("stop")]
        [Authorize]
        public async Task<IActionResult> Stop(
            [FromQuery] string btih,
            [FromQuery] bool removeFiles,
            CancellationToken cancellationToken)
        {
            try
            {
                await _swarmSession.StopAsync(btih, removeFiles, cancellationToken);
            }
            catch (InvalidOperationException)
            {
                // Already stopped / never started — idempotent for clients.
            }

            return NoContent();
        }

        /// <summary>
        /// Per-user search history (0.2) — pinned first, then lastPlayedAt/searchedAt desc.
        /// </summary>
        [HttpGet("history")]
        [Authorize]
        public IActionResult ListHistory()
        {
            var auth = ResolveCurrentUserN(out var userIdN);
            if (auth != null)
            {
                return auth;
            }

            return Ok(new { entries = _history.List(userIdN) });
        }

        [HttpPost("history")]
        [Authorize]
        public IActionResult UpsertHistory([FromBody] SearchHistoryEntry? body)
        {
            var auth = ResolveCurrentUserN(out var userIdN);
            if (auth != null)
            {
                return auth;
            }

            if (body == null
                || (string.IsNullOrWhiteSpace(body.Query) && body.TmdbId is not > 0))
            {
                return BadRequest(new { error = true, message = "query or tmdbId is required." });
            }

            try
            {
                var entry = _history.Upsert(userIdN, body);
                return Ok(entry);
            }
            catch (InvalidDataException)
            {
                return StatusCode(503, new { error = true, message = "history store unreadable." });
            }
        }

        [HttpPost("history/{id}/pin")]
        [Authorize]
        public IActionResult ToggleHistoryPin(string id)
        {
            var auth = ResolveCurrentUserN(out var userIdN);
            if (auth != null)
            {
                return auth;
            }

            if (string.IsNullOrWhiteSpace(id))
            {
                return BadRequest(new { error = true, message = "id is required." });
            }

            try
            {
                var entry = _history.TogglePin(userIdN, id);
                if (entry == null)
                {
                    return NotFound(new { error = true, message = "history entry not found." });
                }

                return Ok(entry);
            }
            catch (InvalidDataException)
            {
                return StatusCode(503, new { error = true, message = "history store unreadable." });
            }
        }

        [HttpDelete("history/{id}")]
        [Authorize]
        public IActionResult DeleteHistoryEntry(string id)
        {
            var auth = ResolveCurrentUserN(out var userIdN);
            if (auth != null)
            {
                return auth;
            }

            if (string.IsNullOrWhiteSpace(id))
            {
                return BadRequest(new { error = true, message = "id is required." });
            }

            try
            {
                if (!_history.Delete(userIdN, id))
                {
                    return NotFound(new { error = true, message = "history entry not found." });
                }

                return NoContent();
            }
            catch (InvalidDataException)
            {
                return StatusCode(503, new { error = true, message = "history store unreadable." });
            }
        }

        /// <summary>
        /// Clear unpinned history. Pass <c>?all=1</c> to clear pinned too.
        /// </summary>
        [HttpDelete("history")]
        [Authorize]
        public IActionResult ClearHistory([FromQuery] int all = 0)
        {
            var auth = ResolveCurrentUserN(out var userIdN);
            if (auth != null)
            {
                return auth;
            }

            try
            {
                var removed = _history.Clear(userIdN, all == 1);
                return Ok(new { removed });
            }
            catch (InvalidDataException)
            {
                return StatusCode(503, new { error = true, message = "history store unreadable." });
            }
        }

        private IActionResult? ResolveCurrentUserN(out string userIdN)
        {
            userIdN = string.Empty;
            var uid = UserHelper.GetCurrentUserId(User);
            if (!uid.HasValue)
            {
                return Forbid();
            }

            // UserConfigurationManager expects folder names in N format (without dashes).
            userIdN = uid.Value.ToString("N");
            return null;
        }

        /// <summary>
        /// Authenticated byte-range stream of the Ensure growing file (real JF playback path).
        /// Client plays via Http MediaSource — Path-only fake items silently no-op in Desktop.
        /// </summary>
        [HttpGet("stream")]
        [Authorize]
        public async Task<IActionResult> Stream(
            [FromQuery] string? btih,
            [FromQuery] int fileIndex = 0,
            CancellationToken cancellationToken = default)
        {
            btih = (btih ?? string.Empty).Trim().ToLowerInvariant();
            if (btih.Length is not (40 or 32))
            {
                return BadRequest(new { error = "invalid_argument", message = "BTIH required for stream." });
            }

            var ensure = await _swarmSession.EnsureAsync(
                new SwarmEnsureRequest
                {
                    Btih = btih,
                    FileIndex = fileIndex,
                    TailMib = JellyfinEnhanced.Instance?.Configuration?.WarmTailMib > 0
                        ? JellyfinEnhanced.Instance.Configuration.WarmTailMib
                        : 8,
                    HeadMib = JellyfinEnhanced.Instance?.Configuration?.WarmHeadMib > 0
                        ? JellyfinEnhanced.Instance.Configuration.WarmHeadMib
                        : 8
                },
                cancellationToken).ConfigureAwait(false);

            var path = ensure.Path;
            var cacheRoot = SwarmCacheRoot();
            if (string.IsNullOrEmpty(path)
                || !path.StartsWith(cacheRoot.TrimEnd('/') + "/", StringComparison.Ordinal)
                || !System.IO.File.Exists(path))
            {
                return NotFound(new
                {
                    error = ensure.Error ?? "not_ready",
                    message = ensure.Message ?? "Growing file not ready to stream yet."
                });
            }

            // Full path under our save root only — no open proxy.
            // ReadWrite share: libtorrent keeps writing the growing file while we stream.
            var contentType = path.EndsWith(".mp4", StringComparison.OrdinalIgnoreCase) ? "video/mp4"
                : path.EndsWith(".webm", StringComparison.OrdinalIgnoreCase) ? "video/webm"
                : "video/x-matroska";
            var stream = new FileStream(
                path,
                FileMode.Open,
                FileAccess.Read,
                FileShare.ReadWrite,
                bufferSize: 1024 * 64,
                FileOptions.Asynchronous | FileOptions.SequentialScan);
            return File(stream, contentType, enableRangeProcessing: true);
        }

        private async Task<List<TorznabReleaseDto>> SearchConfiguredIndexersAsync(
            string query,
            CancellationToken cancellationToken)
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            var endpoints = new List<(string Indexer, string Url)>();
            var nyaa = NormalizeTorznabUrl(config?.TorznabNyaaUrl);
            var tpb = NormalizeTorznabUrl(config?.TorznabTpbUrl);
            if (nyaa != null) endpoints.Add(("nyaa", nyaa));
            if (tpb != null) endpoints.Add(("tpb", tpb));

            var results = new List<TorznabReleaseDto>();
            if (endpoints.Count == 0)
            {
                return results;
            }

            var client = _httpClientFactory.CreateClient();
            client.Timeout = TorznabTimeout;

            foreach (var (indexer, baseUrl) in endpoints)
            {
                cancellationToken.ThrowIfCancellationRequested();
                try
                {
                    var searchUrl = AppendTorznabSearch(baseUrl, query);
                    using var response = await client.GetAsync(searchUrl, cancellationToken).ConfigureAwait(false);
                    if (!response.IsSuccessStatusCode)
                    {
                        continue;
                    }

                    var xml = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
                    foreach (var item in TorznabXmlParser.Parse(xml))
                    {
                        if (string.IsNullOrWhiteSpace(item.Magnet))
                        {
                            continue;
                        }

                        results.Add(new TorznabReleaseDto
                        {
                            Title = item.Title,
                            SizeBytes = item.Size,
                            Seeders = item.Seeders,
                            Magnet = item.Magnet,
                            Indexer = indexer,
                            QueryTitle = query,
                            Btih = MagnetSanitizer.ExtractBtih(item.Magnet)
                        });
                    }
                }
                catch
                {
                    // Per-indexer failure must not kill the lucky path.
                }
            }

            return results;
        }

        private static IEnumerable<TorznabReleaseDto> RankReleases(
            IReadOnlyList<TorznabReleaseDto> releases,
            string query)
        {
            // Drop weak matches client-side too; server gate keeps the list honest.
            const double minSimilarity = 0.67;
            return releases
                .Select(r => (Release: r, Score: TitleSimilarity(r.Title, query)))
                .Where(x => x.Score >= minSimilarity)
                .OrderByDescending(x => x.Score)
                .ThenByDescending(x => x.Release.Seeders)
                .ThenBy(x => string.Equals(x.Release.Indexer, "nyaa", StringComparison.OrdinalIgnoreCase) ? 0 : 1)
                .Select(x => x.Release);
        }

        private static readonly HashSet<string> TitleStopWords = new(StringComparer.Ordinal)
        {
            "a", "an", "the", "to", "of", "and", "or", "in", "on", "for", "with",
            "from", "as", "is", "at", "by", "vs", "via", "into"
        };

        private static double TitleSimilarity(string title, string query)
        {
            var queryWords = SignificantWords(query);
            if (queryWords.Count == 0)
            {
                return 0;
            }

            var titleWords = new HashSet<string>(SignificantWords(title), StringComparer.Ordinal);
            var shared = queryWords.Count(w => titleWords.Contains(w));
            return (double)shared / queryWords.Count;
        }

        private static List<string> SignificantWords(string value)
        {
            var normalized = (value ?? string.Empty)
                .ToLowerInvariant()
                .Replace("'s", "s", StringComparison.Ordinal)
                .Replace("’s", "s", StringComparison.Ordinal)
                .Replace("'", string.Empty, StringComparison.Ordinal)
                .Replace("’", string.Empty, StringComparison.Ordinal);

            return Regex.Split(normalized, @"[^a-z0-9]+")
                .Where(w => w.Length > 1 && !TitleStopWords.Contains(w))
                .ToList();
        }

        /// <summary>
        /// Repair lab footguns: cwd-prefixed values and http:/host (missing slash).
        /// </summary>
        internal static string? NormalizeTorznabUrl(string? raw)
        {
            if (string.IsNullOrWhiteSpace(raw))
            {
                return null;
            }

            var s = raw.Trim();
            var httpIdx = s.IndexOf("https:", StringComparison.OrdinalIgnoreCase);
            var httpIdx2 = s.IndexOf("http:", StringComparison.OrdinalIgnoreCase);
            var idx = httpIdx >= 0 && (httpIdx2 < 0 || httpIdx < httpIdx2) ? httpIdx : httpIdx2;
            if (idx > 0)
            {
                s = s.Substring(idx);
            }

            s = Regex.Replace(s, @"^(https?:)/(?!/)", "$1//", RegexOptions.IgnoreCase);
            if (!Uri.TryCreate(s, UriKind.Absolute, out var uri))
            {
                return null;
            }

            if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
            {
                return null;
            }

            return s;
        }

        /// <summary>
        /// Growing-file root on real disk (btrfs lab cache), not tmpfs /tmp.
        /// Must match native <c>SWARMPLAY_CACHE_DIR</c> / default.
        /// </summary>
        internal static string SwarmCacheRoot()
        {
            var env = Environment.GetEnvironmentVariable("SWARMPLAY_CACHE_DIR");
            return string.IsNullOrWhiteSpace(env)
                ? "/home/brandon/cache/swarmplay"
                : env.TrimEnd('/');
        }

        private static string AppendTorznabSearch(string baseUrl, string query)
        {
            var sep = baseUrl.Contains('?', StringComparison.Ordinal) ? "&" : "?";
            return $"{baseUrl}{sep}t=search&q={Uri.EscapeDataString(query)}&limit=50";
        }


        public sealed class SwarmLuckyRequest
        {
            public string? Query { get; set; }
            public string? DisplayName { get; set; }
            public string? MediaType { get; set; }
            public int? Season { get; set; }
            public int? Episode { get; set; }
        }

        public sealed class TorznabReleaseDto
        {
            public string Title { get; set; } = string.Empty;
            public long SizeBytes { get; set; }
            public int Seeders { get; set; }
            public string? Magnet { get; set; }
            public string? Btih { get; set; }
            public string Indexer { get; set; } = string.Empty;
            public string QueryTitle { get; set; } = string.Empty;
        }
    }
}
