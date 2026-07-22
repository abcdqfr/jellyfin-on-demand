namespace Jellyfin.Plugin.JellyfinOnDemand.Swarm.Torznab
{
    /// <summary>
    /// A release advertised by a Torznab RSS item.
    /// </summary>
    public sealed class TorznabRelease
    {
        public string Title { get; set; } = string.Empty;

        public long Size { get; set; }

        public int Seeders { get; set; }

        public string? Magnet { get; set; }

        public string? Guid { get; set; }
    }
}
