// Copyright (c) jellyfin-on-demand contributors.
// Per-user search history (0.2) — ADR-006 / docs/design/search-history.md

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Jellyfin.Plugin.JellyfinOnDemand.Configuration;

namespace Jellyfin.Plugin.JellyfinOnDemand.Swarm
{
    public sealed class SearchHistoryEntry
    {
        public string Id { get; set; } = string.Empty;
        public string Query { get; set; } = string.Empty;
        public string MediaType { get; set; } = string.Empty;
        public int? TmdbId { get; set; }
        public string? Title { get; set; }
        public string? Year { get; set; }
        public string SearchedAt { get; set; } = string.Empty;
        public string? LastPlayedAt { get; set; }
        public string? LastBtih { get; set; }
        public int? LastFileIndex { get; set; }
        public string? LastReleaseTitle { get; set; }
        public bool Pinned { get; set; }
    }

    public sealed class SearchHistoryDocument
    {
        public List<SearchHistoryEntry> Entries { get; set; } = new();
    }

    /// <summary>
    /// Per-user swarm-history.json via <see cref="UserConfigurationManager"/>.
    /// Cap: 100 unpinned (LRU); pinned excluded from eviction.
    /// </summary>
    public sealed class SearchHistoryStore
    {
        public const string FileName = "swarm-history.json";
        public const int MaxUnpinned = 100;

        private readonly UserConfigurationManager _userConfig;

        public SearchHistoryStore(UserConfigurationManager userConfig)
        {
            _userConfig = userConfig ?? throw new ArgumentNullException(nameof(userConfig));
        }

        public IReadOnlyList<SearchHistoryEntry> List(string userIdN)
        {
            var doc = _userConfig.GetUserConfiguration<SearchHistoryDocument>(userIdN, FileName);
            return SortEntries(doc.Entries ?? new List<SearchHistoryEntry>()).ToList();
        }

        public SearchHistoryEntry Upsert(string userIdN, SearchHistoryEntry incoming)
        {
            if (incoming == null)
            {
                throw new ArgumentNullException(nameof(incoming));
            }

            SearchHistoryEntry? result = null;
            _userConfig.RmwUserConfiguration<SearchHistoryDocument>(userIdN, FileName, doc =>
            {
                doc.Entries ??= new List<SearchHistoryEntry>();
                var now = UtcNowIso();
                var match = FindMatch(doc.Entries, incoming);
                if (match == null)
                {
                    match = new SearchHistoryEntry
                    {
                        Id = string.IsNullOrWhiteSpace(incoming.Id)
                            ? Guid.NewGuid().ToString("D")
                            : incoming.Id.Trim(),
                        SearchedAt = string.IsNullOrWhiteSpace(incoming.SearchedAt) ? now : incoming.SearchedAt,
                        Pinned = incoming.Pinned
                    };
                    doc.Entries.Add(match);
                }

                MergeInto(match, incoming, now);
                PruneUnpinned(doc.Entries);
                result = Clone(match);
                return 1;
            });

            return result!;
        }

        public SearchHistoryEntry? TogglePin(string userIdN, string id)
        {
            SearchHistoryEntry? result = null;
            _userConfig.RmwUserConfiguration<SearchHistoryDocument>(userIdN, FileName, doc =>
            {
                doc.Entries ??= new List<SearchHistoryEntry>();
                var entry = doc.Entries.FirstOrDefault(e =>
                    string.Equals(e.Id, id, StringComparison.OrdinalIgnoreCase));
                if (entry == null)
                {
                    return 0;
                }

                entry.Pinned = !entry.Pinned;
                PruneUnpinned(doc.Entries);
                result = Clone(entry);
                return 1;
            });
            return result;
        }

        public bool Delete(string userIdN, string id)
        {
            var changed = _userConfig.RmwUserConfiguration<SearchHistoryDocument>(userIdN, FileName, doc =>
            {
                doc.Entries ??= new List<SearchHistoryEntry>();
                var removed = doc.Entries.RemoveAll(e =>
                    string.Equals(e.Id, id, StringComparison.OrdinalIgnoreCase));
                return removed > 0 ? 1 : 0;
            });
            return changed > 0;
        }

        /// <summary>
        /// Clears unpinned entries by default; <paramref name="all"/> also removes pinned.
        /// </summary>
        public int Clear(string userIdN, bool all)
        {
            var removed = 0;
            _userConfig.RmwUserConfiguration<SearchHistoryDocument>(userIdN, FileName, doc =>
            {
                doc.Entries ??= new List<SearchHistoryEntry>();
                if (all)
                {
                    removed = doc.Entries.Count;
                    doc.Entries.Clear();
                }
                else
                {
                    removed = doc.Entries.RemoveAll(e => !e.Pinned);
                }

                return removed > 0 ? 1 : 0;
            });
            return removed;
        }

        private static SearchHistoryEntry? FindMatch(List<SearchHistoryEntry> entries, SearchHistoryEntry incoming)
        {
            var mediaType = NormalizeMediaType(incoming.MediaType);
            if (incoming.TmdbId is > 0)
            {
                var byTmdb = entries.FirstOrDefault(e =>
                    e.TmdbId == incoming.TmdbId
                    && string.Equals(NormalizeMediaType(e.MediaType), mediaType, StringComparison.Ordinal));
                if (byTmdb != null)
                {
                    return byTmdb;
                }
            }

            var query = (incoming.Query ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(query))
            {
                return null;
            }

            return entries.FirstOrDefault(e =>
                string.Equals((e.Query ?? string.Empty).Trim(), query, StringComparison.OrdinalIgnoreCase)
                && string.Equals(NormalizeMediaType(e.MediaType), mediaType, StringComparison.Ordinal));
        }

        private static void MergeInto(SearchHistoryEntry dest, SearchHistoryEntry src, string now)
        {
            if (!string.IsNullOrWhiteSpace(src.Query))
            {
                dest.Query = src.Query.Trim();
            }

            if (!string.IsNullOrWhiteSpace(src.MediaType))
            {
                dest.MediaType = NormalizeMediaType(src.MediaType);
            }

            if (src.TmdbId is > 0)
            {
                dest.TmdbId = src.TmdbId;
            }

            if (!string.IsNullOrWhiteSpace(src.Title))
            {
                dest.Title = src.Title.Trim();
            }

            if (!string.IsNullOrWhiteSpace(src.Year))
            {
                dest.Year = src.Year.Trim();
            }

            // Search bump: refresh searchedAt unless this upsert is play-only
            // (lastPlayedAt provided without a fresh searchedAt intent).
            if (!string.IsNullOrWhiteSpace(src.SearchedAt))
            {
                dest.SearchedAt = src.SearchedAt;
            }
            else if (string.IsNullOrWhiteSpace(src.LastPlayedAt)
                     && string.IsNullOrWhiteSpace(src.LastBtih)
                     && string.IsNullOrWhiteSpace(src.LastReleaseTitle))
            {
                dest.SearchedAt = now;
            }
            else if (string.IsNullOrWhiteSpace(dest.SearchedAt))
            {
                dest.SearchedAt = now;
            }

            if (!string.IsNullOrWhiteSpace(src.LastPlayedAt)
                || !string.IsNullOrWhiteSpace(src.LastBtih)
                || !string.IsNullOrWhiteSpace(src.LastReleaseTitle))
            {
                dest.LastPlayedAt = string.IsNullOrWhiteSpace(src.LastPlayedAt) ? now : src.LastPlayedAt;
                if (!string.IsNullOrWhiteSpace(src.LastBtih))
                {
                    dest.LastBtih = src.LastBtih.Trim().ToLowerInvariant();
                }

                if (src.LastFileIndex is >= 0)
                {
                    dest.LastFileIndex = src.LastFileIndex;
                }

                if (!string.IsNullOrWhiteSpace(src.LastReleaseTitle))
                {
                    dest.LastReleaseTitle = src.LastReleaseTitle.Trim();
                }
            }

            // Pin only when explicitly set on a new entry; toggle endpoint owns flips.
            if (string.IsNullOrWhiteSpace(dest.Id) && src.Pinned)
            {
                dest.Pinned = true;
            }
        }

        private static void PruneUnpinned(List<SearchHistoryEntry> entries)
        {
            var unpinned = entries.Where(e => !e.Pinned).ToList();
            if (unpinned.Count <= MaxUnpinned)
            {
                return;
            }

            var drop = unpinned
                .OrderBy(RecencyTicks)
                .Take(unpinned.Count - MaxUnpinned)
                .Select(e => e.Id)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            entries.RemoveAll(e => !e.Pinned && drop.Contains(e.Id));
        }

        private static IEnumerable<SearchHistoryEntry> SortEntries(IEnumerable<SearchHistoryEntry> entries)
        {
            return entries
                .OrderByDescending(e => e.Pinned)
                .ThenByDescending(RecencyTicks);
        }

        private static long RecencyTicks(SearchHistoryEntry e)
        {
            var best = ParseIso(e.LastPlayedAt);
            var searched = ParseIso(e.SearchedAt);
            return best >= searched ? best : searched;
        }

        private static long ParseIso(string? iso)
        {
            if (string.IsNullOrWhiteSpace(iso))
            {
                return 0;
            }

            return DateTime.TryParse(
                    iso,
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.RoundtripKind,
                    out var dt)
                ? dt.ToUniversalTime().Ticks
                : 0;
        }

        private static string NormalizeMediaType(string? mediaType)
        {
            var m = (mediaType ?? string.Empty).Trim().ToLowerInvariant();
            return m is "tv" or "movie" ? m : m;
        }

        private static string UtcNowIso() => DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture);

        private static SearchHistoryEntry Clone(SearchHistoryEntry e) => new()
        {
            Id = e.Id,
            Query = e.Query,
            MediaType = e.MediaType,
            TmdbId = e.TmdbId,
            Title = e.Title,
            Year = e.Year,
            SearchedAt = e.SearchedAt,
            LastPlayedAt = e.LastPlayedAt,
            LastBtih = e.LastBtih,
            LastFileIndex = e.LastFileIndex,
            LastReleaseTitle = e.LastReleaseTitle,
            Pinned = e.Pinned
        };
    }
}
