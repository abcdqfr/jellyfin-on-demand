(function (JE) {
    'use strict';

    async function feelingLucky(query) {
        const search = JE.swarmReleases?.stubSearch;
        const releases = typeof search === 'function' ? await search(query) : [];
        const ranker = JE.ranker || JE.swarmRanker;
        const ranked = typeof ranker?.rank === 'function' ? ranker.rank(releases) : releases;
        const release = ranked[0];

        if (!release || typeof JE.swarm?.ensure !== 'function') return null;
        return JE.swarm.ensure({ btih: release.btih || release.magnet });
    }

    JE.feelingLucky = feelingLucky;
})(window.JellyfinEnhanced);
