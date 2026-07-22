using System;
using System.Collections.Generic;

namespace Jellyfin.Plugin.JellyfinOnDemand.Swarm
{
    /// <summary>
    /// Tail-then-head piece ranges. Floors match strmarr (8 MiB), not % of file.
    /// </summary>
    public static class WarmPlanner
    {
        private const long BytesPerMib = 1024L * 1024L;
        public const long FloorMib = 8;

        public static long BandBytes(long fileLength, long floorMib = FloorMib)
        {
            if (fileLength <= 0)
            {
                throw new ArgumentOutOfRangeException(nameof(fileLength));
            }

            var floor = Math.Max(floorMib, FloorMib) * BytesPerMib;
            return Math.Min(floor, fileLength);
        }

        public static IReadOnlyList<PieceRange> Plan(
            long fileLength,
            long pieceLength,
            long tailMib,
            long headMib)
        {
            if (fileLength <= 0) throw new ArgumentOutOfRangeException(nameof(fileLength));
            if (pieceLength <= 0) throw new ArgumentOutOfRangeException(nameof(pieceLength));
            if (tailMib < 0) throw new ArgumentOutOfRangeException(nameof(tailMib));
            if (headMib < 0) throw new ArgumentOutOfRangeException(nameof(headMib));

            var pieceCount = DivideRoundUp(fileLength, pieceLength);
            var tFloor = tailMib > 0 ? tailMib : FloorMib;
            var hFloor = headMib > 0 ? headMib : FloorMib;
            var tailPieces = Math.Min(pieceCount, DivideRoundUp(BandBytes(fileLength, tFloor), pieceLength));
            var headPieces = Math.Min(pieceCount, DivideRoundUp(BandBytes(fileLength, hFloor), pieceLength));
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
            if (first <= last) ranges.Add(new PieceRange(priority, first, last));
        }

        private static long DivideRoundUp(long dividend, long divisor)
            => dividend == 0 ? 0 : 1 + ((dividend - 1) / divisor);
    }

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
