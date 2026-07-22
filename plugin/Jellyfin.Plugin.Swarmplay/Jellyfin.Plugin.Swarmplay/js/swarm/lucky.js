(function (JE) {
    'use strict';

    /**
     * Rank #1 via POST /lucky (Torznab → play-bind). Pass a query string or
     * { query, title, mediaType, season, episode }.
     */
    async function feelingLucky(queryOrCtx) {
        const ctx = (queryOrCtx && typeof queryOrCtx === 'object')
            ? queryOrCtx
            : { query: queryOrCtx };
        const title = String(ctx.title || ctx.query || '').trim();
        const year = ctx.year ? String(ctx.year) : '';
        const q = String(ctx.query || [title, year].filter(Boolean).join(' ')).trim();
        if (!q) return { ready: false, error: 'missing_query', message: 'Search query is empty.' };
        return JE.swarm.lucky({
            Query: q,
            DisplayName: title || q,
            MediaType: ctx.mediaType || 'movie',
            Season: ctx.mediaType === 'tv' ? (Number(ctx.season) || 1) : null,
            Episode: ctx.mediaType === 'tv' ? (Number(ctx.episode) || 1) : null,
            TailMib: 32,
            HeadMib: 32
        });
    }

    /** Lucky bind + real Jellyfin player (no release picker). */
    async function playFeelingLucky(ctx) {
        const title = (ctx && (ctx.title || ctx.query)) || 'title';
        if (typeof JE.toast === 'function') {
            JE.toast(`Swarmplay: lucky — warming top match for ${title}…`, 5000);
        }
        const bind = await feelingLucky(ctx || {});
        const ready = !!(bind && (bind.ready === true || bind.Ready === true));
        const path = bind?.path || bind?.Path;
        if (!ready || !path) {
            const why = (JE.swarm && JE.swarm.formatError)
                ? JE.swarm.formatError(bind)
                : (bind?.Message || bind?.message || bind?.Error || bind?.error || 'not ready');
            if (typeof JE.toast === 'function') JE.toast(`Swarmplay: ${why}`, 7000);
            return { ok: false, bind };
        }
        if (typeof JE.toast === 'function') JE.toast('Swarmplay: starting playback…', 3000);
        const attempt = await attemptPlayback(bind, title);
        const ok = !!(attempt && attempt.ok);
        if (ok && typeof JE.toast === 'function') JE.toast(`Swarmplay: playing ${title}`, 4000);
        else if (!ok && typeof JE.toast === 'function') {
            JE.toast(`Swarmplay: warm, but no Jellyfin playback (${(attempt && attempt.message) || (attempt && attempt.reason) || 'unknown'})`, 9000);
        }
        return { ok, bind, attempt };
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
    JE.playFeelingLucky = playFeelingLucky;
    JE.swarmAttemptPlayback = attemptPlayback;
    JE.swarmStreamUrl = streamUrl;
})(window.JellyfinEnhanced);
