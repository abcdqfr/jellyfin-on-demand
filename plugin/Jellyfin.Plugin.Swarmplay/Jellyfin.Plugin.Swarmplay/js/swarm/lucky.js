(function (JE) {
    'use strict';

    /**
     * Feeling-lucky: server Torznab → rank #1 → play-bind (Ensure + wait ready).
     * Does not use fixture releases (those have no magnets).
     */
    async function feelingLucky(query) {
        const q = String(query || '').trim();
        if (!q) {
            return { ready: false, error: 'missing_query', phase: 'error' };
        }

        const url = ApiClient.getUrl('/Swarmplay/swarm/lucky');
        try {
            return await ApiClient.ajax({
                type: 'POST',
                url,
                data: JSON.stringify({ query: q }),
                contentType: 'application/json',
                dataType: 'json'
            });
        } catch (e) {
            return {
                ready: false,
                phase: 'error',
                error: 'lucky_request_failed',
                detail: String(e && e.message ? e.message : e)
            };
        }
    }

    /**
     * Best-effort Desktop/web play once play-bind reports a ready Path.
     * Full O6a virtual-item Id binding is still open; this attempts direct Path play.
     */
    async function attemptPlayback(bind, title) {
        if (!bind || !bind.Ready || !bind.Path) return false;
        const pm = window.PlaybackManager || window.playbackManager;
        if (!pm || typeof pm.play !== 'function') return false;

        const item = {
            Name: title || 'Swarmplay',
            Path: bind.Path,
            MediaType: 'Video',
            Type: 'Movie',
            IsFolder: false,
            Id: bind.VirtualItemKey || bind.Btih || 'swarmplay',
            MediaSources: [{
                Id: 'swarmplay',
                Path: bind.Path,
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
