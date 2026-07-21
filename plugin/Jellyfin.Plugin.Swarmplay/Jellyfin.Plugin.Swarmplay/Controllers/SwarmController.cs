// This controller intentionally has no external dependencies.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.Swarmplay.Swarm;
using Jellyfin.Plugin.Swarmplay.Swarm.Torznab;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Swarmplay.Controllers
{
    [Route("Swarmplay/swarm")]
    [ApiController]
    public class SwarmController : ControllerBase
    {
        private static readonly TimeSpan ReadyTimeout = TimeSpan.FromSeconds(90);
        private static readonly TimeSpan TorznabTimeout = TimeSpan.FromSeconds(20);
        private readonly ISwarmSession _swarmSession;
        private readonly IHttpClientFactory _httpClientFactory;

        public SwarmController(ISwarmSession swarmSession, IHttpClientFactory httpClientFactory)
        {
            _swarmSession = swarmSession;
            _httpClientFactory = httpClientFactory;
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

            var btih = ExtractBtih(top.Magnet);
            var ensureRequest = new SwarmEnsureRequest
            {
                // Hex BTIH only for native P/Invoke (magnets get ANSI-corrupted).
                Magnet = string.IsNullOrEmpty(btih) ? top.Magnet : null,
                Btih = btih,
                FileIndex = 0,
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
                ? ExtractBtih(request.Magnet)
                : request.Btih.Trim().ToLowerInvariant();
            request.Btih = btih;
            if (!string.IsNullOrEmpty(btih))
            {
                request.Magnet = null; // avoid ANSI-corrupted magnet P/Invoke
            }

            // Resolve metadata + file list, then strmarr-style file_index pick.
            var source = !string.IsNullOrEmpty(btih) ? btih : (request.Magnet ?? string.Empty);
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

                    if (!ready && string.IsNullOrEmpty(error) && HasFailOpenBytes(path))
                    {
                        ready = true;
                        phase = "fail_open";
                        error = null;
                        message = null;
                        errorCode = null;
                    }

                    if (ready || !string.IsNullOrEmpty(error))
                    {
                        break;
                    }

                    await Task.Delay(250, cancellationToken).ConfigureAwait(false);
                }
            }

            if (!ready && string.IsNullOrEmpty(error) && HasFailOpenBytes(path))
            {
                ready = true;
                phase = "fail_open";
                error = null;
                message = null;
                errorCode = null;
            }

            var bind = new SwarmPlayBindResult
            {
                VirtualItemKey = string.IsNullOrEmpty(btih) ? string.Empty : $"swarm:{btih}:{request.FileIndex}",
                Btih = btih ?? string.Empty,
                FileIndex = request.FileIndex,
                Path = path,
                Ready = ready && !string.IsNullOrEmpty(path),
                Protocol = "File",
                Phase = phase ?? (ready ? "ready" : "error"),
                Error = ready && !string.IsNullOrEmpty(path) ? null : (error ?? "not_ready"),
                Message = message,
                ErrorCode = errorCode
            };
            SwarmErrorText.Apply(bind);
            return Ok(bind);
        }

        [HttpPost("stop")]
        [Authorize]
        public async Task<IActionResult> Stop(
            [FromQuery] string btih,
            [FromQuery] bool removeFiles,
            CancellationToken cancellationToken)
        {
            await _swarmSession.StopAsync(btih, removeFiles, cancellationToken);
            return NoContent();
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
            if (string.IsNullOrEmpty(path)
                || !path.StartsWith("/tmp/swarmplay/", StringComparison.Ordinal)
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
                            Btih = ExtractBtih(item.Magnet)
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
            return releases
                .OrderByDescending(r => TitleSimilarity(r.Title, query))
                .ThenByDescending(r => r.Seeders)
                .ThenBy(r => string.Equals(r.Indexer, "nyaa", StringComparison.OrdinalIgnoreCase) ? 0 : 1);
        }

        private static double TitleSimilarity(string title, string query)
        {
            var titleWords = Words(title);
            var queryWords = Words(query);
            if (titleWords.Count == 0 || queryWords.Count == 0)
            {
                return 0;
            }

            var shared = queryWords.Count(w => titleWords.Contains(w));
            return (double)shared / queryWords.Count;
        }

        private static HashSet<string> Words(string value)
        {
            return new HashSet<string>(
                Regex.Split(value.ToLowerInvariant(), @"[^a-z0-9]+")
                    .Where(w => w.Length > 0),
                StringComparer.Ordinal);
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

        private static string AppendTorznabSearch(string baseUrl, string query)
        {
            var sep = baseUrl.Contains('?', StringComparison.Ordinal) ? "&" : "?";
            return $"{baseUrl}{sep}t=search&q={Uri.EscapeDataString(query)}&limit=50";
        }

        private static bool HasFailOpenBytes(string? path)
        {
            if (string.IsNullOrEmpty(path))
            {
                return false;
            }

            try
            {
                var info = new FileInfo(path);
                return info.Exists && info.Length >= 256 * 1024;
            }
            catch
            {
                return false;
            }
        }

        private static string ExtractBtih(string? magnetOrBtih)
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
                return value.Length == 40 ? value.ToLowerInvariant() : string.Empty;
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

            var hash = value.Substring(start, end - start);
            return hash.Length is 40 or 32 ? hash.ToLowerInvariant() : string.Empty;
        }

        public sealed class SwarmLuckyRequest
        {
            public string? Query { get; set; }
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
