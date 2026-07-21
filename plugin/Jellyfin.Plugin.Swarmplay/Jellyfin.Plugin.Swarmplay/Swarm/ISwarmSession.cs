// Copyright (c) swarmplay contributors.
// Stub interfaces for O7a Ensure — implement when libtorrent native is wired.
// See docs/design/ensure-ready.md

using System.Threading;
using System.Threading.Tasks;

namespace Jellyfin.Plugin.Swarmplay.Swarm
{
    public sealed class SwarmEnsureRequest
    {
        public string Btih { get; set; } = string.Empty;
        public string? Magnet { get; set; }
        public int FileIndex { get; set; }
        public int TailMib { get; set; } = 8;
        public int HeadMib { get; set; } = 8;
        public string WarmOrder { get; set; } = "tail_then_head";
    }

    public sealed class SwarmEnsureResult
    {
        public string? Path { get; set; }
        public bool Ready { get; set; }
        public string? Phase { get; set; }
        public string? Error { get; set; }
    }

    public sealed class SwarmStatusResult
    {
        public string? Path { get; set; }
        public bool Ready { get; set; }
        public string? Phase { get; set; }
        public int Peers { get; set; }
        public double Progress { get; set; }
        public string? Error { get; set; }
    }

    /// <summary>
    /// Virtual play binding (O6a): ready growing-file Path for Jellyfin MediaSource.
    /// </summary>
    public sealed class SwarmPlayBindResult
    {
        public string VirtualItemKey { get; set; } = string.Empty;
        public string Btih { get; set; } = string.Empty;
        public int FileIndex { get; set; }
        public string? Path { get; set; }
        public bool Ready { get; set; }
        public string Protocol { get; set; } = "File";
        public string? Phase { get; set; }
        public string? Error { get; set; }
    }

    /// <summary>
    /// In-process libtorrent session (O7a). Stub until native bridge exists.
    /// </summary>
    public interface ISwarmSession
    {
        Task<SwarmEnsureResult> EnsureAsync(SwarmEnsureRequest request, CancellationToken cancellationToken);
        Task<SwarmStatusResult> StatusAsync(string btih, CancellationToken cancellationToken);
        Task StopAsync(string btih, bool removeFiles, CancellationToken cancellationToken);
    }

    /// <summary>
    /// Placeholder implementation — always reports unavailable (safe offline default).
    /// </summary>
    public sealed class StubSwarmSession : ISwarmSession
    {
        public Task<SwarmEnsureResult> EnsureAsync(SwarmEnsureRequest request, CancellationToken cancellationToken)
        {
            return Task.FromResult(new SwarmEnsureResult
            {
                Path = null,
                Ready = false,
                Phase = "unavailable",
                Error = "native_libtorrent_not_wired"
            });
        }

        public Task<SwarmStatusResult> StatusAsync(string btih, CancellationToken cancellationToken)
        {
            return Task.FromResult(new SwarmStatusResult
            {
                Ready = false,
                Phase = "unavailable",
                Error = "native_libtorrent_not_wired"
            });
        }

        public Task StopAsync(string btih, bool removeFiles, CancellationToken cancellationToken)
        {
            return Task.CompletedTask;
        }
    }
}
