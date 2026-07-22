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
            TailMib: 8,
            HeadMib: 8
        });
    }

    /** Lucky bind + real Jellyfin player. TV delegates to the ranked-top + episode-picker
     * flow (JE.swarmPlayLucky in releases.js) so series/episode picks aren't silent. */
    async function playFeelingLucky(ctx) {
        if (typeof JE.swarmSetBatchSession === 'function') JE.swarmSetBatchSession(null);
        if (ctx && ctx.mediaType === 'tv' && typeof JE.swarmPlayLucky === 'function') {
            return JE.swarmPlayLucky(ctx);
        }
        // Yield Discover before warm so the JF player is never buried under it.
        if (typeof JE.swarmHideDiscover === 'function') {
            try { JE.swarmHideDiscover(); } catch (_) { /* ignore */ }
        }
        const title = (ctx && (ctx.title || ctx.query)) || 'title';
        showWarmOverlay(`Lucky — warming top match for ${title}…`);
        let bind;
        try {
            bind = await feelingLucky(ctx || {});
        } finally {
            hideWarmOverlay();
        }
        const ready = !!(bind && (bind.ready === true || bind.Ready === true));
        const path = bind?.path || bind?.Path;
        if (!ready || !path) {
            const why = (JE.swarm && JE.swarm.formatError)
                ? JE.swarm.formatError(bind)
                : (bind?.Message || bind?.message || bind?.Error || bind?.error || 'not ready');
            if (typeof JE.toast === 'function') JE.toast(`Swarmplay: ${why}`, 7000);
            return { ok: false, bind };
        }
        if (JE.swarmHistory && typeof JE.swarmHistory.recordPlay === 'function') {
            const releaseTitle = bind?.DisplayName || bind?.displayName || title;
            JE.swarmHistory.recordPlay(ctx || {}, bind, releaseTitle);
        }
        if (typeof JE.toast === 'function') JE.toast('Swarmplay: starting playback…', 3000);
        const attempt = await attemptPlayback(bind, title);
        const ok = !!(attempt && attempt.ok);
        if (ok && attempt.message && typeof JE.toast === 'function') {
            JE.toast(`Swarmplay: ${attempt.message}`, 5000);
        } else if (ok && typeof JE.toast === 'function') {
            JE.toast(`Swarmplay: playing ${title}`, 4000);
        } else if (!ok && typeof JE.toast === 'function') {
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
        // Discover (and any other Swarmplay custom pane) must leave the stack
        // before JF's player / item details show — otherwise video renders
        // "behind" Discover and the user only sees an empty shell.
        if (typeof JE.swarmHideDiscover === 'function') {
            try { JE.swarmHideDiscover(); } catch (_) { /* ignore */ }
        }

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
            // Some JF web builds want a full ItemDto, not bare ids.
            try {
                const userId = ApiClient.getCurrentUserId?.();
                const item = userId
                    ? await ApiClient.getItem(userId, itemId)
                    : null;
                if (item) {
                    await pm.play({
                        items: [item],
                        startPositionTicks: 0,
                        fullscreen: true
                    });
                    await new Promise((r) => setTimeout(r, 900));
                    if (isJellyfinPlayerUi()) {
                        return { ok: true, via: 'playback_manager_items', itemId };
                    }
                }
            } catch (e) {
                console.warn('swarmplay: playbackManager.play(items) failed', e);
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
                // Remote session accepted the command — tell the user where it went
                // instead of silently succeeding with no local player UI.
                return {
                    ok: true,
                    via: 'session_play_now_sent',
                    itemId,
                    sessionId: session.Id,
                    message: `Play sent to ${session.Client || 'remote session'} — check that client.`
                };
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

        // 3) Last resort: open the real item details, then click JF's own Play
        // so the user does not need a second manual click.
        if (window.Emby?.Page?.showItem) {
            window.Emby.Page.showItem(itemId);
            await new Promise((r) => setTimeout(r, 700));
            const playBtn = document.querySelector(
                '.mainDetailButtons .btnPlay:not(.hide), .detailButton-play, button.btnPlay[data-mode="play"], .btnPlay'
            );
            if (playBtn && !playBtn.disabled) {
                try {
                    playBtn.click();
                    await new Promise((r) => setTimeout(r, 900));
                    if (isJellyfinPlayerUi()) {
                        return { ok: true, via: 'item_details_auto_play', itemId };
                    }
                } catch (e) {
                    console.warn('swarmplay: detail Play click failed', e);
                }
            }
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
    const WARM_OVERLAY_ID = 'swarmplay-warm-overlay';
    let warmPollTimer = null;

    function stopWarmProgressPoll() {
        if (warmPollTimer) {
            clearTimeout(warmPollTimer);
            warmPollTimer = null;
        }
    }

    /** Real percentage (native warm_progress: tail+head[+readahead] pieces on
     * disk / total in that set) — not a guess, and not raw libtorrent
     * torrent progress (that denominator changes size mid-warm and would
     * make the bar visibly jump/regress). Polls independently of whatever
     * blocking play-bind/ensure/lucky call is in flight. */
    function startWarmProgressPoll(btih) {
        stopWarmProgressPoll();
        if (!btih) return; // caller doesn't know btih yet (e.g. movie /lucky) — stays indeterminate
        const tick = async () => {
            const el = document.getElementById(WARM_OVERLAY_ID);
            if (!el) { stopWarmProgressPoll(); return; }
            try {
                const status = await JE.swarm.status(btih);
                const pct = Number(status && (status.progress ?? status.Progress));
                if (Number.isFinite(pct)) {
                    const peers = Number(status.numPeers ?? status.NumPeers ?? status.peers ?? status.Peers) || 0;
                    const fill = el.querySelector('.swarmplay-warm-bar-fill');
                    const sub = el.querySelector('.swarmplay-warm-sub');
                    if (fill) {
                        fill.classList.remove('indeterminate');
                        fill.style.width = `${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%`;
                    }
                    if (sub) {
                        sub.textContent = `Head + tail extents — ${Math.round(Math.max(0, Math.min(1, pct)) * 100)}% · ${peers} peer${peers === 1 ? '' : 's'}`;
                    }
                }
            } catch (e) { /* transient — keep polling, overlay just stays at last-known % */ }
            warmPollTimer = setTimeout(tick, 1000);
        };
        tick();
    }

    /** btih (optional): when known up front, drives a real progress bar via
     * startWarmProgressPoll; omit it (e.g. movie /lucky, which resolves btih
     * server-side) and the bar just stays an indeterminate sweep. */
    function showWarmOverlay(msg, btih) {
        hideWarmOverlay();
        const el = document.createElement('div');
        el.id = WARM_OVERLAY_ID;
        el.setAttribute('role', 'status');
        el.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;';
        el.innerHTML = `<div style="background:#1c1c1e;color:#f5f5f7;padding:1.2rem 1.5rem;border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.5);font-size:.95rem;max-width:24rem;text-align:center;">
            <div class="swarmplay-warm-bar-track" style="width:14rem;height:.5rem;border-radius:999px;background:rgba(255,255,255,.15);margin:0 auto .75rem;overflow:hidden;">
                <div class="swarmplay-warm-bar-fill indeterminate" style="height:100%;width:40%;background:#56d7ff;border-radius:999px;"></div>
            </div>
            <div>${String(msg || 'Warming swarm…').replace(/</g, '&lt;')}</div>
            <div class="swarmplay-warm-sub" style="opacity:.65;font-size:.8rem;margin-top:.4rem;">Head + tail extents — please wait</div>
        </div>`;
        if (!document.getElementById('swarmplay-warm-keyframes')) {
            const s = document.createElement('style');
            s.id = 'swarmplay-warm-keyframes';
            s.textContent = '@keyframes swarmplay-spin{to{transform:rotate(360deg)}}'
                + '@keyframes swarmplay-indeterminate{0%{margin-left:-40%;}100%{margin-left:100%;}}'
                + '.swarmplay-warm-bar-fill{transition:width .3s linear;}'
                + '.swarmplay-warm-bar-fill.indeterminate{animation:swarmplay-indeterminate 1.1s ease-in-out infinite;}';
            document.head.appendChild(s);
        }
        document.body.appendChild(el);
        startWarmProgressPoll(btih);
    }

    function hideWarmOverlay() {
        stopWarmProgressPoll();
        document.getElementById(WARM_OVERLAY_ID)?.remove();
    }

    /** Remember the multi-file batch so the native prev/next track buttons can
     * step through it (see hijackTrackButtons below) — no floating custom chrome. */
    function setBatchSession(session) {
        JE.swarmBatchSession = session || null;
        syncTrackButtons();
    }

    function batchNeighbors(s) {
        const idx = Number(s.fileIndex) || 0;
        const order = s.files.map((f, i) => ({ f, i })).sort((a, b) => {
            const ai = a.f.index ?? a.f.Index ?? a.i;
            const bi = b.f.index ?? b.f.Index ?? b.i;
            return ai - bi;
        });
        const pos = order.findIndex((x) => (x.f.index ?? x.f.Index) === idx);
        return {
            prev: pos > 0 ? order[pos - 1].f : null,
            next: pos >= 0 && pos < order.length - 1 ? order[pos + 1].f : null
        };
    }

    /** Jellyfin's own OSD ships .btnPreviousTrack/.btnNextTrack (queue nav) inside
     * .videoOsdBottom — already fades/hides with the rest of the player chrome.
     * Hijack their click in the capture phase (blocks JF's own playlist handler)
     * and drive our batch session instead of building separate floating buttons. */
    function hijackTrackButton(btn, pickFile) {
        if (!btn || btn.dataset.swarmplayHijacked) return;
        btn.dataset.swarmplayHijacked = '1';
        btn.addEventListener('click', (e) => {
            const s = JE.swarmBatchSession;
            if (!s) return; // no swarm batch — let Jellyfin's native handler run untouched
            e.preventDefault();
            e.stopImmediatePropagation();
            const file = pickFile(s);
            if (file) playBatchNeighbor(file);
        }, { capture: true });
    }

    function syncTrackButtons() {
        const prevBtn = document.querySelector('.btnPreviousTrack');
        const nextBtn = document.querySelector('.btnNextTrack');
        if (!prevBtn || !nextBtn) return;
        hijackTrackButton(prevBtn, (s) => batchNeighbors(s).prev);
        hijackTrackButton(nextBtn, (s) => batchNeighbors(s).next);
        const s = JE.swarmBatchSession;
        const active = !!(s && Array.isArray(s.files) && s.files.length > 1);
        if (!active) {
            if (prevBtn.dataset.swarmplayForced) {
                prevBtn.classList.add('hide');
                nextBtn.classList.add('hide');
                prevBtn.disabled = true;
                nextBtn.disabled = true;
                delete prevBtn.dataset.swarmplayForced;
                delete nextBtn.dataset.swarmplayForced;
            }
            return;
        }
        const { prev, next } = batchNeighbors(s);
        prevBtn.dataset.swarmplayForced = '1';
        nextBtn.dataset.swarmplayForced = '1';
        prevBtn.classList.remove('hide');
        nextBtn.classList.remove('hide');
        prevBtn.disabled = !prev;
        nextBtn.disabled = !next;
        prevBtn.title = prev ? 'Previous file in this release' : '';
        nextBtn.title = next ? 'Next file in this release' : '';
    }

    function stopTrackButtonWatch() {
        if (JE._swarmTrackObs) {
            JE._swarmTrackObs.disconnect();
            JE._swarmTrackObs = null;
        }
        if (JE._swarmTrackTimer) {
            clearInterval(JE._swarmTrackTimer);
            JE._swarmTrackTimer = null;
        }
    }

    function watchTrackButtons() {
        stopTrackButtonWatch();
        syncTrackButtons();
        JE._swarmTrackObs = new MutationObserver(syncTrackButtons);
        JE._swarmTrackObs.observe(document.body, { childList: true, subtree: true });
        JE._swarmTrackTimer = setInterval(syncTrackButtons, 1000);
    }
    watchTrackButtons();

    async function playBatchNeighbor(file) {
        const s = JE.swarmBatchSession;
        if (!s) return;
        const fileIndex = file.index ?? file.Index ?? 0;
        const season = file.season ?? file.Season ?? null;
        const episode = file.episode ?? file.Episode ?? null;
        const title = s.ctx?.title || s.releaseTitle || 'episode';
        showWarmOverlay(`Warming next file in pack…`, s.btih);
        try {
            const bind = await JE.swarm.playBind({
                Btih: s.btih || '',
                Magnet: s.magnet || null,
                FileIndex: fileIndex,
                FileIndexExplicit: true,
                Season: season,
                Episode: episode,
                MediaType: s.ctx?.mediaType || 'tv',
                DisplayName: title,
                TailMib: 8,
                HeadMib: 8
            });
            const ready = !!(bind && (bind.ready === true || bind.Ready === true));
            const path = bind?.path || bind?.Path;
            if (!ready || !path) {
                const why = (JE.swarm && JE.swarm.formatError)
                    ? JE.swarm.formatError(bind)
                    : (bind?.Message || bind?.message || 'not ready');
                if (typeof JE.toast === 'function') JE.toast(`Swarmplay: ${why}`, 7000);
                return;
            }
            s.fileIndex = fileIndex;
            setBatchSession(s);
            if (JE.swarmHistory?.recordPlay) JE.swarmHistory.recordPlay(s.ctx || {}, bind, s.releaseTitle || title);
            const attempt = await attemptPlayback(bind, title);
            if (!(attempt && attempt.ok) && typeof JE.toast === 'function') {
                JE.toast(`Swarmplay: ${attempt.message || attempt.reason || 'playback failed'}`, 8000);
            } else if (attempt?.message && typeof JE.toast === 'function') {
                JE.toast(`Swarmplay: ${attempt.message}`, 5000);
            }
        } finally {
            hideWarmOverlay();
        }
    }

    JE.playFeelingLucky = playFeelingLucky;
    JE.swarmAttemptPlayback = attemptPlayback;
    JE.swarmShowWarmOverlay = showWarmOverlay;
    JE.swarmHideWarmOverlay = hideWarmOverlay;
    JE.swarmSetBatchSession = setBatchSession;
    JE.swarmStreamUrl = streamUrl;
})(window.JellyfinEnhanced);
