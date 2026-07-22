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

    /** JF 10.11 webpack — playbackManager is not on window (projectionist lore). */
    function resolvePlaybackManager() {
        const candidates = [
            window.PlaybackManager,
            window.playbackManager,
            window.Emby?.PlaybackManager,
            window.require?.defined?.('playbackManager') && window.require('playbackManager'),
            // jellyfin-xposed / rare injectors
            window.Xp?.components?.playback?.playbackmanager,
            window.Xp?.playbackManager
        ];
        for (const pm of candidates) {
            if (pm && typeof pm.play === 'function') return pm;
        }
        return null;
    }

    function ensureOverlayStyles() {
        if (document.getElementById('swarmplay-player-styles')) return;
        const style = document.createElement('style');
        style.id = 'swarmplay-player-styles';
        style.textContent = `
            #swarmplay-player-overlay {
                position: fixed; inset: 0; z-index: 2147483000;
                background: #000; display: flex; flex-direction: column;
            }
            #swarmplay-player-overlay .bar {
                display: flex; align-items: center; gap: .75rem;
                padding: .5rem .75rem; background: rgba(0,0,0,.85); color: #f5f5f7;
                font: 14px/1.3 system-ui, sans-serif;
            }
            #swarmplay-player-overlay .bar button {
                background: rgba(255,255,255,.12); border: 0; color: inherit;
                border-radius: 6px; padding: .35rem .7rem; cursor: pointer;
            }
            #swarmplay-player-overlay .title { flex: 1; opacity: .85; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            #swarmplay-player-overlay video { flex: 1; width: 100%; height: 100%; background: #000; outline: none; }
        `;
        document.head.appendChild(style);
    }

    /**
     * Fullscreen HTML5 video overlay — works when JF's playbackManager is not global.
     */
    function playViaOverlay(url, title) {
        ensureOverlayStyles();
        document.getElementById('swarmplay-player-overlay')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'swarmplay-player-overlay';
        overlay.innerHTML = `
            <div class="bar">
                <button type="button" data-act="close">Close</button>
                <div class="title"></div>
            </div>
            <video controls autoplay playsinline></video>`;
        overlay.querySelector('.title').textContent = title || 'Swarmplay';
        const video = overlay.querySelector('video');
        video.src = url;

        const close = () => {
            try { video.pause(); } catch (_) { /* ignore */ }
            video.removeAttribute('src');
            video.load();
            overlay.remove();
            document.removeEventListener('keydown', onKey);
        };
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        overlay.querySelector('[data-act="close"]').onclick = close;
        document.addEventListener('keydown', onKey);
        document.body.appendChild(overlay);

        return video.play()
            .then(() => ({ ok: true, url, via: 'overlay' }))
            .catch((e) => {
                // Still show controls — user can hit play (autoplay policies).
                console.warn('swarmplay: overlay autoplay blocked', e);
                return { ok: true, url, via: 'overlay_manual', reason: 'autoplay_blocked' };
            });
    }

    /**
     * Real playback: try JF playbackManager if exposed; else overlay <video> on stream URL.
     * @returns {{ ok:boolean, reason?:string, url?:string, via?:string }}
     */
    async function attemptPlayback(bind, title) {
        if (!bind || !(bind.Ready || bind.ready)) {
            return { ok: false, reason: 'not_ready' };
        }
        const url = streamUrl(bind);
        if (!url) return { ok: false, reason: 'missing_btih' };

        const pm = resolvePlaybackManager();
        if (pm) {
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
                await pm.play({ items: [item], startPositionTicks: 0, fullscreen: true });
                await new Promise((r) => setTimeout(r, 700));
                const player = typeof pm.getCurrentPlayer === 'function' ? pm.getCurrentPlayer() : null;
                if (player || document.querySelector('.videoOsdBottom, video.htmlvideoplayer, video')) {
                    return { ok: true, url, via: 'playback_manager' };
                }
            } catch (e) {
                console.warn('swarmplay: playbackManager.play failed, falling back to overlay', e);
            }
        }

        return playViaOverlay(url, title);
    }

    JE.feelingLucky = feelingLucky;
    JE.swarmAttemptPlayback = attemptPlayback;
    JE.swarmStreamUrl = streamUrl;
})(window.JellyfinEnhanced);
