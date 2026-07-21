// Offline ranker. Fixtures: docs/design/fixtures/ranker-cases.json
(function (JE) {
    'use strict';

    const resolutionPoints = { '2160': 100, '1080': 80, '720': 40, '480': 10 };
    const sourcePoints = { bluray: 30, 'web-dl': 25, webrip: 25, hdtv: 10, cam: -50, ts: -50 };
    const sizeBands = {
        '2160': [4e9, 40e9], '1080': [1.5e9, 20e9],
        '720': [0.7e9, 8e9], '480': [0.2e9, 3e9]
    };
    const indexerOrder = { nyaa: 0, tpb: 1 };

    function resolution(value) {
        const match = String(value || '').match(/(2160|1080|720|480)/);
        return match ? match[1] : '';
    }

    function words(value) {
        return new Set(String(value || '').toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean));
    }

    function titleSimilarity(title, queryTitle) {
        const titleWords = words(title);
        const queryWords = words(queryTitle);
        if (!titleWords.size || !queryWords.size) return 0;
        let shared = 0;
        queryWords.forEach(word => { if (titleWords.has(word)) shared++; });
        return shared / queryWords.size;
    }

    function languagePoints(release) {
        const language = String(release.language || '').toLowerCase();
        const preferred = release.preferredLanguages || release.preferred_languages || ['en'];
        if (!language) return 0;
        return preferred.map(String).map(x => x.toLowerCase()).includes(language) ? 15 : -10;
    }

    function score(release, queryTitle) {
        release = release || {};
        const res = resolution(release.resolution || release.title);
        const source = String(release.source || '').toLowerCase();
        const seeders = Math.max(0, Number(release.seeders) || 0);
        const size = Number(release.size_bytes);
        const band = sizeBands[res];
        const sizeFit = band && (!Number.isFinite(size) || size < band[0] || size > band[1]) ? -20 : 0;
        const junk = /\b(sample|trailer|xxx)\b/i.test(String(release.title || '')) ||
            /^(cam|ts)$/i.test(source) ? 100 : 0;

        return (resolutionPoints[res] || 0) + (sourcePoints[source] || 0) +
            Math.log2(1 + seeders) * 8 + sizeFit + languagePoints(release) +
            titleSimilarity(release.title, queryTitle || release.query_title) * 20 - junk;
    }

    function compare(a, b, queryTitle) {
        const junkA = /\b(sample|trailer|xxx)\b/i.test(String(a.title || '')) ||
            /^(cam|ts)$/i.test(String(a.source || ''));
        const junkB = /\b(sample|trailer|xxx)\b/i.test(String(b.title || '')) ||
            /^(cam|ts)$/i.test(String(b.source || ''));
        if (junkA !== junkB) return junkA ? 1 : -1;
        const delta = score(b, queryTitle) - score(a, queryTitle);
        if (Math.abs(delta) > 5) return delta;
        const seeders = (Number(b.seeders) || 0) - (Number(a.seeders) || 0);
        if (seeders) return seeders;
        return (indexerOrder[String(a.indexer || '').toLowerCase()] ?? 99) -
            (indexerOrder[String(b.indexer || '').toLowerCase()] ?? 99);
    }

    function rank(releases) {
        const list = Array.isArray(releases) ? releases : [];
        const queryTitle = list.find(item => item && item.query_title)?.query_title;
        return list.slice().sort((a, b) => compare(a, b, queryTitle));
    }

    function rankSelfTest(releases, expectedOrder) {
        const actual = rank(releases).map(item => item.id || item.btih);
        return Array.isArray(expectedOrder) && actual.length === expectedOrder.length &&
            actual.every((id, index) => id === expectedOrder[index]);
    }

    JE.swarmRanker = { score, rank, rankSelfTest };
    JE.ranker = JE.swarmRanker;
})(window.JellyfinEnhanced);
