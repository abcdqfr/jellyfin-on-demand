// This controller intentionally has no external dependencies.
using System;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.Swarmplay.Swarm;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Swarmplay.Controllers
{
    [Route("Swarmplay/swarm")]
    [ApiController]
    public class SwarmController : ControllerBase
    {
        private static readonly TimeSpan ReadyTimeout = TimeSpan.FromSeconds(90);
        private readonly ISwarmSession _swarmSession;

        public SwarmController(ISwarmSession swarmSession)
        {
            _swarmSession = swarmSession;
        }

        [HttpPost("ensure")]
        public Task<SwarmEnsureResult> Ensure(
            [FromBody] SwarmEnsureRequest request,
            CancellationToken cancellationToken)
        {
            return _swarmSession.EnsureAsync(request, cancellationToken);
        }

        [HttpGet("status")]
        public Task<SwarmStatusResult> Status(
            [FromQuery] string btih,
            CancellationToken cancellationToken)
        {
            return _swarmSession.StatusAsync(btih, cancellationToken);
        }

        /// <summary>
        /// O6a play bind: Ensure → wait ready → return File Path for MediaSource.
        /// Does not create a library/.strm row.
        /// </summary>
        [HttpPost("play-bind")]
        public async Task<ActionResult<SwarmPlayBindResult>> PlayBind(
            [FromBody] SwarmEnsureRequest request,
            CancellationToken cancellationToken)
        {
            var ensure = await _swarmSession.EnsureAsync(request, cancellationToken).ConfigureAwait(false);
            var btih = string.IsNullOrWhiteSpace(request.Btih)
                ? ExtractBtih(request.Magnet)
                : request.Btih.Trim().ToLowerInvariant();

            var ready = ensure.Ready;
            var path = ensure.Path;
            var phase = ensure.Phase;
            var error = ensure.Error;

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
                    if (!string.IsNullOrEmpty(status.Path))
                    {
                        path = status.Path;
                    }

                    if (ready || !string.IsNullOrEmpty(error))
                    {
                        break;
                    }

                    await Task.Delay(250, cancellationToken).ConfigureAwait(false);
                }
            }

            if (string.IsNullOrEmpty(path) || !ready)
            {
                return Ok(new SwarmPlayBindResult
                {
                    VirtualItemKey = string.IsNullOrEmpty(btih) ? string.Empty : $"swarm:{btih}:{request.FileIndex}",
                    Btih = btih ?? string.Empty,
                    FileIndex = request.FileIndex,
                    Path = path,
                    Ready = false,
                    Protocol = "File",
                    Phase = phase ?? "error",
                    Error = error ?? "not_ready"
                });
            }

            return Ok(new SwarmPlayBindResult
            {
                VirtualItemKey = $"swarm:{btih}:{request.FileIndex}",
                Btih = btih ?? string.Empty,
                FileIndex = request.FileIndex,
                Path = path,
                Ready = true,
                Protocol = "File",
                Phase = phase ?? "ready",
                Error = null
            });
        }

        [HttpPost("stop")]
        public async Task<IActionResult> Stop(
            [FromQuery] string btih,
            [FromQuery] bool removeFiles,
            CancellationToken cancellationToken)
        {
            await _swarmSession.StopAsync(btih, removeFiles, cancellationToken);
            return NoContent();
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
    }
}
