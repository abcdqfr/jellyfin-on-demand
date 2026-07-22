using System;
using System.Collections.Generic;

namespace Jellyfin.Plugin.Swarmplay.Swarm
{
    /// <summary>
    /// Builds non-overlapping piece ranges for tail-first media warming.
    /// Mature band: max(32 MiB, 5% of file) unless an explicit larger floor is requested.
    /// </summary>
    public static class WarmPlanner
    {
        private const long BytesPerMib = 1024L * 1024L;
        public const long FloorMib = 32;

        /// <summary>Bytes for one warm band: max(floorMiB, 5% of file).</summary>
        public static long BandBytes(long fileLength, long floorMib = FloorMib)
        {
            if (fileLength <= 0)
            {
                throw new ArgumentOutOfRangeException(nameof(fileLength));
            }

            var floor = Math.Max(floorMib, FloorMib) * BytesPerMib;
            var pct = fileLength / 20;
            return Math.Max(floor, pct);
        }

        /// <summary>
        /// Returns ranges in download order: tail, head, then the remaining middle.
        /// </summary>
        public static IReadOnlyList<PieceRange> Plan(
            long fileLength,
            long pieceLength,
            long tailMib,
            long headMib)
        {
            if (fileLength <= 0)
            {
                throw new ArgumentOutOfRangeException(nameof(fileLength));
            }

            if (pieceLength <= 0)
            {
                throw new ArgumentOutOfRangeException(nameof(pieceLength));
            }

            if (tailMib < 0)
            {
                throw new ArgumentOutOfRangeException(nameof(tailMib));
            }

            if (headMib < 0)
            {
                throw new ArgumentOutOfRangeException(nameof(headMib));
            }

            var pieceCount = DivideRoundUp(fileLength, pieceLength);
            var tailPieces = Math.Min(pieceCount, DivideRoundUp(BandBytes(fileLength, tailMib > 0 ? tailMib : FloorMib), pieceLength));
            var headPieces = Math.Min(pieceCount, DivideRoundUp(BandBytes(fileLength, headMib > 0 ? headMib : FloorMib), pieceLength));
            var tailStart = pieceCount - tailPieces;
            var headEnd = Math.Min(headPieces - 1, tailStart - 1);
            var ranges = new List<PieceRange>(3);

            AddRange(ranges, "tail", tailStart, pieceCount - 1);
            AddRange(ranges, "head", 0, headEnd);
            AddRange(ranges, "sequential", headEnd + 1, tailStart - 1);
            return ranges;
        }

        private static void AddRange(List<PieceRange> ranges, string priority, long first, long last)
        {
            if (first <= last)
            {
                ranges.Add(new PieceRange(priority, first, last));
            }
        }

        private static long DivideRoundUp(long dividend, long divisor)
        {
            return dividend == 0 ? 0 : 1 + ((dividend - 1) / divisor);
        }
    }

    /// <summary>
    /// An inclusive, zero-based piece range and its planned priority phase.
    /// </summary>
    public sealed class PieceRange
    {
        public PieceRange(string priority, long firstPiece, long lastPiece)
        {
            Priority = priority;
            FirstPiece = firstPiece;
            LastPiece = lastPiece;
        }

        public string Priority { get; }

        public long FirstPiece { get; }

        public long LastPiece { get; }
    }
}
