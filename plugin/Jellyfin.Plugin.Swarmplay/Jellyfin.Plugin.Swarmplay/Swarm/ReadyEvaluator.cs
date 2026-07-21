namespace Jellyfin.Plugin.Swarmplay.Swarm
{
    /// <summary>
    /// Evaluates the ordered ready predicates: warm complete, head magic, then timeout.
    /// </summary>
    public static class ReadyEvaluator
    {
        // Validated offline by scripts/offline_ready_check.py.
        public static string Evaluate(
            long tailBytesHave,
            long headBytesHave,
            bool headMagicOk,
            bool warmDeadlineExceeded,
            long warmBandBytes,
            long headMagicMinBytes,
            long timeoutHeadMinBytes)
        {
            if (tailBytesHave >= warmBandBytes && headBytesHave >= warmBandBytes)
            {
                return "A";
            }

            if (headBytesHave >= headMagicMinBytes && headMagicOk)
            {
                return "B";
            }

            if (warmDeadlineExceeded && headBytesHave >= timeoutHeadMinBytes)
            {
                return "C";
            }

            return "none";
        }
    }
}
