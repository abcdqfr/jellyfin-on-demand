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
            Magnet: top.magnet || top.Magnet || null,
            FileIndex: 0,
            MediaType: 'movie',
            DisplayName: q,
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
            || window.location.hash.startsWith('#/video')
        );
    }

    async function fetchSessions() {
        try {
            return await ApiClient.getJSON(ApiClient.getUrl('Sessions'));
        } catch (e) {
            console.warn('swarmplay: Sessions list failed', e);
            return [];
        }
    }

    /** Prefer Jellyfin Desktop (SupportsRemoteControl); else any controllable session. */
    function pickPlaySession(sessions) {
        const list = Array.isArray(sessions) ? sessions : [];
        const controllable = list.filter((s) => s && s.SupportsRemoteControl && s.Id);
        if (!controllable.length) return null;
        const desktop = controllable.find((s) => /jellyfin\s*desktop/i.test(String(s.Client || '')));
        return desktop || controllable[0];
    }

    /**
     * Play via real Jellyfin item Id only:
     * 1) playbackManager.play({ ids }) if exposed
     * 2) Sessions/.../Playing PlayNow to Desktop (uses JF’s own player + transcoder)
     * Never a DIY &lt;video&gt; overlay.
     */
    async function attemptPlayback(bind, title) {
        document.getElementById('swarmplay-player-overlay')?.remove();
        document.getElementById('swarmplay-player-styles')?.remove();

        if (!bind || !(bind.Ready || bind.ready)) {
            return { ok: false, reason: 'not_ready' };
        }
        const itemId = bind.ItemId || bind.itemId;
        if (!itemId) {
            return {
                ok: false,
                reason: 'no_item_id',
                message: 'Play-bind did not return a Jellyfin ItemId. Cannot open the real player.'
            };
        }

        const serverId = ApiClient.serverId?.() || ApiClient.serverInfo?.()?.Id;

        // 1) Local playbackManager with server ids (real PlaybackInfo path).
        const pm = resolvePlaybackManager();
        if (pm) {
            try {
                await pm.play({
                    ids: [itemId],
                    serverId,
                    startPositionTicks: 0,
                    fullscreen: true
                });
                await new Promise((r) => setTimeout(r, 900));
                if (isJellyfinPlayerUi()) {
                    return { ok: true, via: 'playback_manager_ids', itemId };
                }
            } catch (e) {
                console.warn('swarmplay: playbackManager.play(ids) failed', e);
            }
        }

        // 2) PlayNow to controllable Desktop session — JF client owns the player.
        const session = pickPlaySession(await fetchSessions());
        if (session) {
            try {
                await ApiClient.ajax({
                    type: 'POST',
                    url: ApiClient.getUrl(`Sessions/${session.Id}/Playing`, {
                        playCommand: 'PlayNow',
                        itemIds: itemId
                    })
                });
                await new Promise((r) => setTimeout(r, 1200));
                if (isJellyfinPlayerUi()) {
                    return { ok: true, via: 'session_play_now', itemId, sessionId: session.Id };
                }
                // Command accepted; Desktop may take a moment — treat as success if 204-class.
                return { ok: true, via: 'session_play_now_sent', itemId, sessionId: session.Id };
            } catch (e) {
                console.warn('swarmplay: Session PlayNow failed', e);
                return {
                    ok: false,
                    reason: 'session_play_failed',
                    itemId,
                    message: String(e && e.message ? e.message : e)
                };
            }
        }

        // 3) Last resort: open the real item details (user hits JF Play — still real player).
        if (window.Emby?.Page?.showItem) {
            window.Emby.Page.showItem(itemId);
            return {
                ok: false,
                reason: 'opened_item_details',
                itemId,
                message: 'Opened the Jellyfin item — press Play in the normal UI (no plugin player).'
            };
        }

        return {
            ok: false,
            reason: 'no_jellyfin_player',
            itemId,
            message: 'No controllable Jellyfin session and no playbackManager — cannot start the real player.'
        };
    }

    JE.feelingLucky = feelingLucky;
    JE.swarmAttemptPlayback = attemptPlayback;
    JE.swarmStreamUrl = streamUrl;
})(window.JellyfinEnhanced);
