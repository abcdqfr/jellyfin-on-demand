using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Xml.Linq;

namespace Jellyfin.Plugin.Swarmplay.Swarm.Torznab
{
    /// <summary>
    /// Parses the small Torznab RSS release shape used by offline fixtures.
    /// </summary>
    public static class TorznabXmlParser
    {
        public static IReadOnlyList<TorznabRelease> Parse(string xml)
        {
            if (string.IsNullOrWhiteSpace(xml))
            {
                throw new ArgumentException("XML is required.", nameof(xml));
            }

            return XDocument.Parse(xml)
                .Descendants("item")
                .Select(item => new TorznabRelease
                {
                    Title = item.Element("title")?.Value ?? string.Empty,
                    Guid = item.Element("guid")?.Value,
                    Magnet = FindMagnet(item),
                    Size = FindAttributeValue<long>(item, "size", long.TryParse),
                    Seeders = FindAttributeValue<int>(item, "seeders", int.TryParse)
                })
                .ToList();
        }

        private static string? FindMagnet(XElement item)
        {
            // Prowlarr often puts the magnet in <guid>, with <link> as a download URL.
            foreach (var candidate in new[]
            {
                item.Element("guid")?.Value,
                item.Element("link")?.Value,
                FindAttributeString(item, "magneturl"),
                FindAttributeString(item, "magnetUrl")
            })
            {
                if (!string.IsNullOrWhiteSpace(candidate)
                    && candidate.StartsWith("magnet:?", StringComparison.OrdinalIgnoreCase))
                {
                    return candidate.Trim();
                }
            }

            return null;
        }

        private static string? FindAttributeString(XElement item, string name)
        {
            return item.Elements()
                .FirstOrDefault(element =>
                    element.Name.LocalName == "attr" &&
                    string.Equals((string?)element.Attribute("name"), name, StringComparison.OrdinalIgnoreCase))
                ?.Attribute("value")?.Value;
        }

        private static T FindAttributeValue<T>(
            XElement item,
            string name,
            TryParse<T> tryParse)
        {
            var value = item.Elements()
                .FirstOrDefault(element =>
                    element.Name.LocalName == "attr" &&
                    string.Equals((string?)element.Attribute("name"), name, StringComparison.OrdinalIgnoreCase))
                ?.Attribute("value")?.Value;

            return value != null && tryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var result)
                ? result
                : default!;
        }

        private delegate bool TryParse<T>(string value, NumberStyles styles, IFormatProvider provider, out T result);
    }
}
