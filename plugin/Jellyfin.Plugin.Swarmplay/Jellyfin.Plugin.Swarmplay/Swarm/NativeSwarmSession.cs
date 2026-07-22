using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Jellyfin.Plugin.Swarmplay.Swarm
{
    /// <summary>
    /// Managed P/Invoke adapter for the stable swarmplay native session ABI.
    /// </summary>
    public sealed class NativeSwarmSession : ISwarmSession
    {
        private const string NativeLibrary = "libswarmplay_native.so";
        private const int ListFilesBufferBytes = 512 * 1024;

        [StructLayout(LayoutKind.Sequential)]
        private struct SwarmEnsureResultNative
        {
            public IntPtr Path;
            public int Ready;
            public int Error;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct SwarmStatusResultNative
        {
            public int Ready;
            public int Error;
            public int HasMetadata;
            public int NumPeers;
            public int NumSeeds;
            public int DhtNodes;
            public float Progress;
        }

        [DllImport(NativeLibrary, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
        private static extern int swarm_ensure(
            [MarshalAs(UnmanagedType.LPStr)] string btihOrMagnet,
            int fileIndex,
            int tailMib,
            int headMib,
            out SwarmEnsureResultNative result);

        [DllImport(NativeLibrary, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
        private static extern int swarm_status(
            [MarshalAs(UnmanagedType.LPStr)] string btih,
            out SwarmStatusResultNative result);

        [DllImport(NativeLibrary, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
        private static extern int swarm_stop(
            [MarshalAs(UnmanagedType.LPStr)] string btih,
            int removeFiles);

        [DllImport(NativeLibrary, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
        private static extern int swarm_list_files(
            [MarshalAs(UnmanagedType.LPStr)] string source,
            byte[] jsonOut,
            int jsonCap);

        [DllImport(NativeLibrary, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
        private static extern int swarm_cache_ensure(
            [MarshalAs(UnmanagedType.LPStr)] string btihOrMagnet,
            int fileIndex,
            [MarshalAs(UnmanagedType.LPStr)] string destDir,
            out SwarmEnsureResultNative result);

        [DllImport(NativeLibrary, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
        private static extern int swarm_cache_status(
            [MarshalAs(UnmanagedType.LPStr)] string btihOrMagnet,
            int fileIndex,
            out SwarmStatusResultNative result);

        internal static ISwarmSession CreateOrStub()
        {
            try
            {
                _ = swarm_status("invalid", out _);
                return new NativeSwarmSession();
            }
            catch (DllNotFoundException)
            {
                return new StubSwarmSession();
            }
        }

        public Task<SwarmEnsureResult> EnsureAsync(SwarmEnsureRequest request, CancellationToken cancellationToken)
        {
            return Task.Run(() =>
            {
                cancellationToken.ThrowIfCancellationRequested();
                var source = PreferAsciiSource(request);
                var resultCode = swarm_ensure(
                    source,
                    request.FileIndex,
                    request.TailMib,
                    request.HeadMib,
                    out var nativeResult);

                var errorCode = nativeResult.Error != 0 ? nativeResult.Error : resultCode;
                var phase = errorCode == 0
                    ? (nativeResult.Ready != 0 ? "ready" : "warming")
                    : (errorCode == -3 ? "dead_pin" : "error");
                var result = new SwarmEnsureResult
                {
                    Path = nativeResult.Path == IntPtr.Zero ? null : Marshal.PtrToStringAnsi(nativeResult.Path),
                    Ready = nativeResult.Ready != 0,
                    Phase = phase,
                    Error = errorCode == 0 ? null : $"native_error_{errorCode}",
                    ErrorCode = errorCode == 0 ? null : errorCode
                };
                SwarmErrorText.Apply(result);
                return result;
            }, cancellationToken);
        }

        public Task<SwarmStatusResult> StatusAsync(string btih, CancellationToken cancellationToken)
        {
            return Task.Run(() =>
            {
                cancellationToken.ThrowIfCancellationRequested();
                var resultCode = swarm_status(btih, out var nativeResult);
                var errorCode = nativeResult.Error != 0 ? nativeResult.Error : resultCode;
                var phase = errorCode == 0
                    ? (nativeResult.Ready != 0 ? "ready" : "warming")
                    : (errorCode == -3 ? "dead_pin" : "error");
                var result = new SwarmStatusResult
                {
                    Ready = nativeResult.Ready != 0,
                    Phase = phase,
                    HasMetadata = nativeResult.HasMetadata != 0,
                    Peers = nativeResult.NumPeers,
                    NumPeers = nativeResult.NumPeers,
                    NumSeeds = nativeResult.NumSeeds,
                    DhtNodes = nativeResult.DhtNodes,
                    Progress = nativeResult.Progress,
                    Error = errorCode == 0 ? null : $"native_error_{errorCode}",
                    ErrorCode = errorCode == 0 ? null : errorCode
                };
                if (result.Error != null)
                {
                    var (code, message, n) = SwarmErrorText.Describe(result.ErrorCode, result.Error);
                    result.Error = code;
                    result.Message = message;
                    result.ErrorCode = n;
                }

                return result;
            }, cancellationToken);
        }

        /// <summary>
        /// 0.4 cache-to-library: whole-file download straight into <paramref name="destDir"/>
        /// (no extent-gate/warm dance — this is archival, not playback). Returns immediately;
        /// poll <see cref="CacheStatusAsync"/> for progress/completion.
        /// </summary>
        public Task<SwarmEnsureResult> CacheEnsureAsync(
            string btihOrMagnet,
            int fileIndex,
            string destDir,
            CancellationToken cancellationToken)
        {
            return Task.Run(() =>
            {
                cancellationToken.ThrowIfCancellationRequested();
                var source = PreferAsciiSource(new SwarmEnsureRequest { Btih = btihOrMagnet, Magnet = btihOrMagnet });
                var resultCode = swarm_cache_ensure(source, fileIndex, destDir, out var nativeResult);
                var errorCode = nativeResult.Error != 0 ? nativeResult.Error : resultCode;
                var result = new SwarmEnsureResult
                {
                    Path = nativeResult.Path == IntPtr.Zero ? null : Marshal.PtrToStringAnsi(nativeResult.Path),
                    Ready = nativeResult.Ready != 0,
                    Phase = errorCode == 0 ? (nativeResult.Ready != 0 ? "ready" : "caching") : "error",
                    Error = errorCode == 0 ? null : $"native_error_{errorCode}",
                    ErrorCode = errorCode == 0 ? null : errorCode
                };
                SwarmErrorText.Apply(result);
                return result;
            }, cancellationToken);
        }

        public Task<SwarmStatusResult> CacheStatusAsync(
            string btihOrMagnet,
            int fileIndex,
            CancellationToken cancellationToken)
        {
            return Task.Run(() =>
            {
                cancellationToken.ThrowIfCancellationRequested();
                var source = PreferAsciiSource(new SwarmEnsureRequest { Btih = btihOrMagnet, Magnet = btihOrMagnet });
                var resultCode = swarm_cache_status(source, fileIndex, out var nativeResult);
                var errorCode = nativeResult.Error != 0 ? nativeResult.Error : resultCode;
                var result = new SwarmStatusResult
                {
                    Ready = nativeResult.Ready != 0,
                    Phase = errorCode == 0 ? (nativeResult.Ready != 0 ? "ready" : "caching") : "error",
                    HasMetadata = nativeResult.HasMetadata != 0,
                    Peers = nativeResult.NumPeers,
                    NumPeers = nativeResult.NumPeers,
                    NumSeeds = nativeResult.NumSeeds,
                    DhtNodes = nativeResult.DhtNodes,
                    Progress = nativeResult.Progress,
                    Error = errorCode == 0 ? null : $"native_error_{errorCode}",
                    ErrorCode = errorCode == 0 ? null : errorCode
                };
                if (result.Error != null)
                {
                    var (code, message, n) = SwarmErrorText.Describe(result.ErrorCode, result.Error);
                    result.Error = code;
                    result.Message = message;
                    result.ErrorCode = n;
                }

                return result;
            }, cancellationToken);
        }

        public Task StopAsync(string btih, bool removeFiles, CancellationToken cancellationToken)
        {
            return Task.Run(() =>
            {
                cancellationToken.ThrowIfCancellationRequested();
                var resultCode = swarm_stop(btih, removeFiles ? 1 : 0);
                if (resultCode != 0)
                {
                    throw new InvalidOperationException($"swarm_stop_failed_{resultCode}");
                }
            }, cancellationToken);
        }

        public Task<IReadOnlyList<SwarmTorrentFile>> ListFilesAsync(string btihOrMagnet, CancellationToken cancellationToken)
        {
            return Task.Run(() =>
            {
                cancellationToken.ThrowIfCancellationRequested();
                var source = PreferAsciiSource(new SwarmEnsureRequest { Btih = btihOrMagnet, Magnet = btihOrMagnet });
                var buffer = new byte[ListFilesBufferBytes];
                var rc = swarm_list_files(source, buffer, buffer.Length);
                if (rc != 0)
                {
                    return (IReadOnlyList<SwarmTorrentFile>)Array.Empty<SwarmTorrentFile>();
                }

                var end = Array.IndexOf(buffer, (byte)0);
                var json = System.Text.Encoding.UTF8.GetString(buffer, 0, end < 0 ? buffer.Length : end);
                if (string.IsNullOrWhiteSpace(json))
                {
                    return Array.Empty<SwarmTorrentFile>();
                }

                try
                {
                    var rows = JsonSerializer.Deserialize<List<NativeFileRow>>(json);
                    if (rows == null) return Array.Empty<SwarmTorrentFile>();
                    var list = new List<SwarmTorrentFile>(rows.Count);
                    foreach (var row in rows)
                    {
                        list.Add(new SwarmTorrentFile
                        {
                            Index = row.index,
                            Size = row.size,
                            Path = row.path ?? string.Empty
                        });
                    }

                    return list;
                }
                catch
                {
                    return Array.Empty<SwarmTorrentFile>();
                }
            }, cancellationToken)!;
        }

        /// <summary>
        /// Prefer sanitized ASCII magnet (xt + tr) over bare btih so Torznab trackers reach libtorrent.
        /// </summary>
        private static string PreferAsciiSource(SwarmEnsureRequest request)
        {
            var btih = (request.Btih ?? string.Empty).Trim().ToLowerInvariant();
            var sanitized = MagnetSanitizer.BuildAsciiMagnet(request.Magnet, btih);
            if (!string.IsNullOrEmpty(sanitized))
            {
                return sanitized;
            }

            if (btih.Length is 40 or 32)
            {
                return btih;
            }

            var magnet = request.Magnet?.Trim();
            return !string.IsNullOrWhiteSpace(magnet) ? magnet : btih;
        }

        private sealed class NativeFileRow
        {
            public int index { get; set; }
            public long size { get; set; }
            public string? path { get; set; }
        }
    }
}
