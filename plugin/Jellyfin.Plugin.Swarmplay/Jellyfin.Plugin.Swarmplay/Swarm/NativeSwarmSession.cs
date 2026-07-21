using System;
using System.Runtime.InteropServices;
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
        private const int SwarmErrorUnavailable = -1;

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

        internal static ISwarmSession CreateOrStub()
        {
            try
            {
                // A deliberately invalid source forces the runtime to resolve the library
                // without creating a libtorrent session or starting network activity.
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
                // Prefer 40-char hex BTIH: CharSet.Ansi corrupts long magnet URIs
                // (dn=/tracker query UTF-8) and parse_magnet_uri then returns -2.
                var btih = (request.Btih ?? string.Empty).Trim().ToLowerInvariant();
                var magnet = request.Magnet?.Trim();
                var source = btih.Length is 40 or 32
                    ? btih
                    : (!string.IsNullOrWhiteSpace(magnet) ? magnet : btih);
                var resultCode = swarm_ensure(
                    source ?? string.Empty,
                    request.FileIndex,
                    request.TailMib,
                    request.HeadMib,
                    out var nativeResult);

                return new SwarmEnsureResult
                {
                    Path = nativeResult.Path == IntPtr.Zero ? null : Marshal.PtrToStringAnsi(nativeResult.Path),
                    Ready = nativeResult.Ready != 0,
                    Phase = GetPhase(resultCode, nativeResult.Error, nativeResult.Ready != 0),
                    Error = GetError(resultCode, nativeResult.Error)
                };
            }, cancellationToken);
        }

        public Task<SwarmStatusResult> StatusAsync(string btih, CancellationToken cancellationToken)
        {
            return Task.Run(() =>
            {
                cancellationToken.ThrowIfCancellationRequested();
                var resultCode = swarm_status(btih, out var nativeResult);
                return new SwarmStatusResult
                {
                    Ready = nativeResult.Ready != 0,
                    Phase = GetPhase(resultCode, nativeResult.Error, nativeResult.Ready != 0),
                    Error = GetError(resultCode, nativeResult.Error)
                };
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

        private static string GetPhase(int resultCode, int nativeError, bool ready)
        {
            if (resultCode == 0 && nativeError == 0)
            {
                return ready ? "ready" : "warming";
            }

            return nativeError == SwarmErrorUnavailable ? "unavailable" : "error";
        }

        private static string? GetError(int resultCode, int nativeError)
        {
            var error = nativeError != 0 ? nativeError : resultCode;
            return error == 0 ? null : $"native_error_{error}";
        }
    }
}
