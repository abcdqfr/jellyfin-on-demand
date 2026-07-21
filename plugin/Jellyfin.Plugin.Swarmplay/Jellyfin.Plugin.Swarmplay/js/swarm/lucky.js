(function (JE) {
    'use strict';

    /** @deprecated Prefer JE.swarmShowReleasePicker — kept for scripts that still call lucky. */
    async function feelingLucky(query) {
        const q = String(query || '').trim();
        if (!q) return { ready: false, error: 'missing_query', message: 'Search query is empty.' };
        const data = await JE.swarm.searchTorznab(q);
        const top = (data.results || [])[0];
        if (!top) {
            return {
                ready: false,
                error: 'torznab_empty',
                message: JE.swarm.formatError({ error: 'torznab_empty' })
            };
        }
        const btih = top.btih || top.Btih;
        return JE.swarm.playBind({
            Btih: btih || '',
            Magnet: btih ? null : (top.magnet || top.Magnet),
            FileIndex: 0,
            MediaType: 'movie',
            TailMib: 8,
            HeadMib: 8
        });
    }

    async function attemptPlayback(bind, title) {
        if (!bind || !(bind.Ready || bind.ready) || !(bind.Path || bind.path)) return false;
        const pm = window.PlaybackManager || window.playbackManager;
        if (!pm || typeof pm.play !== 'function') return false;
        const path = bind.Path || bind.path;
        const item = {
            Name: title || 'Swarmplay',
            Path: path,
            MediaType: 'Video',
            Type: 'Movie',
            IsFolder: false,
            Id: bind.VirtualItemKey || bind.Btih || 'swarmplay',
            MediaSources: [{
                Id: 'swarmplay',
                Path: path,
                Protocol: 'File',
                Type: 'Default',
                SupportsDirectPlay: true,
                SupportsDirectStream: true,
                SupportsTranscoding: true
            }]
        };
        try {
            await pm.play({ items: [item] });
            return true;
        } catch (e) {
            console.warn('swarmplay: playbackManager.play failed', e);
            return false;
        }
    }

    JE.feelingLucky = feelingLucky;
    JE.swarmAttemptPlayback = attemptPlayback;
})(window.JellyfinEnhanced);
