(function (JE) {
    'use strict';

    const fixtures = [
        { id: 'fixture-2160', title: 'Example Film 2160p BluRay', resolution: '2160p', source: 'bluray', seeders: 42, size_bytes: 12000000000, language: 'en', indexer: 'nyaa' },
        { id: 'fixture-1080', title: 'Example Film 1080p WEB-DL', resolution: '1080p', source: 'web-dl', seeders: 180, size_bytes: 4500000000, language: 'en', indexer: 'tpb' },
        { id: 'fixture-720', title: 'Example Film 720p WEBRip', resolution: '720p', source: 'webrip', seeders: 90, size_bytes: 1800000000, language: 'en', indexer: 'nyaa' }
    ];

    function stubSearch(query) {
        const queryTitle = String(query || '').trim();
        return fixtures.map(release => ({ ...release, query_title: queryTitle }));
    }

    function renderRankedList(container, releases) {
        if (!container || typeof container.replaceChildren !== 'function') return [];
        const ranker = JE.ranker || JE.swarmRanker;
        const ranked = typeof ranker?.rank === 'function' ? ranker.rank(releases) : (releases || []).slice();
        const list = document.createElement('ul');

        ranked.forEach(release => {
            const item = document.createElement('li');
            item.textContent = `${release.title} — ${release.resolution || 'unknown'} — ${release.seeders || 0} seeders`;
            list.appendChild(item);
        });
        container.replaceChildren(list);
        return ranked;
    }

    JE.swarmReleases = { stubSearch, renderRankedList };
})(window.JellyfinEnhanced);
