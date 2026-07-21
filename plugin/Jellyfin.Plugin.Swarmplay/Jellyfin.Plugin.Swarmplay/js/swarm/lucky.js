(function (JE) {
    'use strict';

    /** @deprecated Prefer JE.swarmShowReleasePicker */
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

    function streamUrl(bind) {
        const btih = bind.Btih || bind.btih;
        const fileIndex = bind.FileIndex ?? bind.fileIndex ?? 0;
        if (!btih) return null;
        // api_key so <video>/hls fetch authenticates (headers are not always sent).
        return ApiClient.getUrl('/Swarmplay/swarm/stream', {
            btih,
            fileIndex,
            api_key: ApiClient.accessToken()
        });
    }

    /**
     * Real playback attempt via authenticated HTTP stream of the growing file.
     * Path-only fake items resolve in playbackManager but never start a player.
     * @returns {{ ok:boolean, reason?:string, url?:string }}
     */
    async function attemptPlayback(bind, title) {
        if (!bind || !(bind.Ready || bind.ready)) {
            return { ok: false, reason: 'not_ready' };
        }
        const url = streamUrl(bind);
        if (!url) return { ok: false, reason: 'missing_btih' };

        const pm = window.PlaybackManager || window.playbackManager;
        if (!pm || typeof pm.play !== 'function') {
            return { ok: false, reason: 'no_playback_manager', url };
        }

        const item = {
            Name: title || 'Swarmplay',
            Id: (bind.VirtualItemKey || bind.Btih || 'swarmplay').replace(/[^a-zA-Z0-9_-]/g, ''),
            ServerId: ApiClient.serverId?.() || ApiClient.serverInfo?.()?.Id,
            MediaType: 'Video',
            Type: 'Movie',
            IsFolder: false,
            RunTimeTicks: 0,
            MediaSources: [{
                Id: 'swarmplay',
                Path: url,
                Protocol: 'Http',
                Type: 'Default',
                Container: 'mkv',
                IsRemote: true,
                SupportsDirectPlay: true,
                SupportsDirectStream: true,
                SupportsTranscoding: true,
                RequiredHttpHeaders: {},
                Formats: [],
                MediaStreams: [{
                    Type: 'Video',
                    Index: 0,
                    IsDefault: true,
                    IsForced: false,
                    Codec: 'h264'
                }]
            }]
        };

        try {
            await pm.play({
                items: [item],
                startPositionTicks: 0,
                fullscreen: true
            });
            // play() often resolves even when nothing started — verify a player engaged.
            await new Promise((r) => setTimeout(r, 700));
            const player = typeof pm.getCurrentPlayer === 'function'
                ? pm.getCurrentPlayer()
                : (pm._currentPlayer || null);
            const state = typeof pm.getPlayerState === 'function' ? pm.getPlayerState() : null;
            const videoEl = document.querySelector('video.htmlvideoplayer, video.videoPlayer, .videoPlayerContainer video, video');
            const engaged = !!(
                player
                || (state && (state.PlayState || state.NowPlayingItem))
                || (videoEl && !videoEl.paused)
                || document.querySelector('.videoOsdBottom, #videoOsdPage, .htmlvideoplayer')
            );
            if (!engaged) {
                return { ok: false, reason: 'player_did_not_start', url };
            }
            return { ok: true, url };
        } catch (e) {
            console.warn('swarmplay: playbackManager.play failed', e);
            return { ok: false, reason: String(e && e.message ? e.message : e), url };
        }
    }

    JE.feelingLucky = feelingLucky;
    JE.swarmAttemptPlayback = attemptPlayback;
    JE.swarmStreamUrl = streamUrl;
})(window.JellyfinEnhanced);
