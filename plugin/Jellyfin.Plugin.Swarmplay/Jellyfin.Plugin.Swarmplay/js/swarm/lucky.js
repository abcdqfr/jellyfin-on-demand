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
        return ApiClient.getUrl('/Swarmplay/swarm/stream', {
            btih,
            fileIndex,
            api_key: ApiClient.accessToken()
        });
    }

    /** JF's real player only — never a DIY <video> overlay. */
    function resolvePlaybackManager() {
        const candidates = [
            window.PlaybackManager,
            window.playbackManager,
            window.Emby?.PlaybackManager,
            window.require?.defined?.('playbackManager') && window.require('playbackManager'),
            window.Xp?.components?.playback?.playbackmanager,
            window.Xp?.playbackManager
        ];
        for (const pm of candidates) {
            if (pm && typeof pm.play === 'function') return pm;
        }
        return null;
    }

    function isJellyfinPlayerUi() {
        return !!(
            document.querySelector('.videoOsdBottom')
            || document.querySelector('#videoOsdPage')
            || document.querySelector('video.htmlvideoplayer')
            || document.querySelector('.htmlvideoplayer')
        );
    }

    /**
     * Start playback only through Jellyfin's playbackManager (normal OSD / transcode).
     * If that is unavailable or does not engage JF UI → fail. No overlay fallback.
     * @returns {{ ok:boolean, reason?:string, url?:string, via?:string }}
     */
    async function attemptPlayback(bind, title) {
        // Kill any leftover overlay from older builds.
        document.getElementById('swarmplay-player-overlay')?.remove();
        document.getElementById('swarmplay-player-styles')?.remove();

        if (!bind || !(bind.Ready || bind.ready)) {
            return { ok: false, reason: 'not_ready' };
        }
        const url = streamUrl(bind);
        if (!url) return { ok: false, reason: 'missing_btih' };

        const pm = resolvePlaybackManager();
        if (!pm) {
            return {
                ok: false,
                reason: 'no_jellyfin_player',
                url,
                message: 'Swarm is warm, but Jellyfin’s player is not available to plugins on this client. No substitute player — bind a real JF item next.'
            };
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
            await new Promise((r) => setTimeout(r, 800));
            if (!isJellyfinPlayerUi()) {
                return {
                    ok: false,
                    reason: 'jellyfin_player_did_not_start',
                    url,
                    message: 'playbackManager.play returned without opening Jellyfin’s video OSD.'
                };
            }
            return { ok: true, url, via: 'jellyfin_player' };
        } catch (e) {
            console.warn('swarmplay: Jellyfin playbackManager.play failed', e);
            return {
                ok: false,
                reason: String(e && e.message ? e.message : e),
                url
            };
        }
    }

    JE.feelingLucky = feelingLucky;
    JE.swarmAttemptPlayback = attemptPlayback;
    JE.swarmStreamUrl = streamUrl;
})(window.JellyfinEnhanced);
