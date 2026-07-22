// Swarmplay search history UI (0.2) — floating control + modal.
(function (JE) {
    'use strict';

    const logPrefix = 'swarmplay:history:';
    const FLOAT_ID = 'swarmplay-history-float';
    const BACKDROP_ID = 'swarmplay-history-backdrop';
    const STYLE_ID = 'swarmplay-history-styles';

    function swarmDiscoveryOn() {
        return JE.pluginConfig?.SwarmplayDiscoveryEnabled !== false
            && !JE.pluginConfig?.JellyseerrEnabled;
    }

    function esc(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    }

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${FLOAT_ID} {
                position: fixed; right: 1.1rem; bottom: 5.5rem; z-index: 99990;
                background: #1c1c1e; color: #f5f5f7; border: 1px solid rgba(255,255,255,.18);
                border-radius: 999px; padding: .55rem 1rem; font-size: .9rem; cursor: pointer;
                box-shadow: 0 8px 24px rgba(0,0,0,.35); opacity: .92;
            }
            #${FLOAT_ID}:hover { opacity: 1; background: #2c2c2e; }
            .swarmplay-history-backdrop {
                position: fixed; inset: 0; background: rgba(0,0,0,.55); z-index: 99998;
                display: flex; align-items: center; justify-content: center; padding: 1rem;
            }
            .swarmplay-history-panel {
                width: min(640px, 100%); max-height: min(85vh, 720px); overflow: auto;
                background: #1c1c1e; color: #f5f5f7; border-radius: 10px;
                box-shadow: 0 12px 40px rgba(0,0,0,.45);
            }
            .swarmplay-history-panel header {
                padding: 1rem 1.1rem .55rem; position: sticky; top: 0; background: #1c1c1e; z-index: 1;
            }
            .swarmplay-history-panel h2 { margin: 0; font-size: 1.15rem; }
            .swarmplay-history-panel .sub { opacity: .7; margin: .35rem 0 0; font-size: .9rem; }
            .swarmplay-history-panel .toolbar {
                display: flex; gap: .5rem; flex-wrap: wrap; padding: .35rem 1.1rem .75rem;
                position: sticky; top: 4.1rem; background: #1c1c1e; z-index: 1;
                border-bottom: 1px solid rgba(255,255,255,.08);
            }
            .swarmplay-history-panel .toolbar button, .swarmplay-history-row .ops button {
                background: #2c2c2e; color: #f5f5f7; border: 1px solid rgba(255,255,255,.15);
                border-radius: 6px; padding: .3rem .55rem; font-size: .8rem; cursor: pointer;
            }
            .swarmplay-history-panel .toolbar button:hover,
            .swarmplay-history-row .ops button:hover { background: #3a3a3c; }
            .swarmplay-history-panel .close {
                float: right; background: transparent; border: 0; color: inherit;
                font-size: 1.4rem; cursor: pointer; line-height: 1;
            }
            .swarmplay-history-list { list-style: none; margin: 0; padding: .4rem 0 1rem; }
            .swarmplay-history-row {
                margin: 0 .75rem .45rem; padding: .7rem .85rem; border-radius: 8px;
                background: rgba(255,255,255,.06); display: flex; gap: .75rem; align-items: flex-start;
            }
            .swarmplay-history-row .body { flex: 1; min-width: 0; cursor: pointer; }
            .swarmplay-history-row .body:hover { color: #9be7ff; }
            .swarmplay-history-row .meta { opacity: .75; font-size: .85rem; margin-top: .25rem; }
            .swarmplay-history-row .pin-badge {
                display: inline-block; margin-right: .35rem; padding: .05rem .35rem;
                border-radius: 4px; background: rgba(250, 204, 21, .2); font-size: .75rem;
            }
            .swarmplay-history-row .ops { display: flex; flex-direction: column; gap: .3rem; }
            .swarmplay-history-empty, .swarmplay-history-loading { padding: 1.25rem; opacity: .8; }
        `;
        document.head.appendChild(style);
    }

    function closePanel() {
        document.getElementById(BACKDROP_ID)?.remove();
    }

    function entryTitle(e) {
        return e.title || e.Title || e.query || e.Query || 'Untitled';
    }

    function entryQuery(e) {
        return e.query || e.Query || entryTitle(e);
    }

    function entryMediaType(e) {
        return (e.mediaType || e.MediaType || 'movie').toLowerCase();
    }

    function entryTmdbId(e) {
        const v = e.tmdbId ?? e.TmdbId;
        return v != null && Number(v) > 0 ? Number(v) : null;
    }

    function formatWhen(e) {
        const played = e.lastPlayedAt || e.LastPlayedAt;
        const searched = e.searchedAt || e.SearchedAt;
        if (played) return `Played ${String(played).slice(0, 16).replace('T', ' ')}`;
        if (searched) return `Searched ${String(searched).slice(0, 16).replace('T', ' ')}`;
        return '';
    }

    async function openEntry(entry) {
        closePanel();
        const tmdbId = entryTmdbId(entry);
        const mediaType = entryMediaType(entry);
        const title = entryTitle(entry);
        const year = entry.year || entry.Year || null;
        const query = year ? `${title} ${year}` : entryQuery(entry);

        if (tmdbId && JE.jellyseerrMoreInfo?.open) {
            try {
                await JE.jellyseerrMoreInfo.open(tmdbId, mediaType);
                return;
            } catch (err) {
                console.warn(logPrefix, 'more-info open failed', err);
            }
        }

        if (typeof JE.swarmShowReleasePicker === 'function') {
            await JE.swarmShowReleasePicker({
                query,
                title,
                year,
                tmdbId,
                mediaType,
                season: mediaType === 'tv' ? 1 : null,
                episode: mediaType === 'tv' ? 1 : null
            });
            return;
        }

        if (typeof JE.toast === 'function') {
            JE.toast('Swarmplay: cannot open history entry', 4000);
        }
    }

    async function renderList(panel) {
        const host = panel.querySelector('[data-history-list]');
        if (!host) return;
        host.innerHTML = '<div class="swarmplay-history-loading">Loading…</div>';
        const data = await JE.swarm.listHistory();
        const entries = (data && (data.entries || data.Entries)) || [];
        if (!entries.length) {
            host.innerHTML = '<div class="swarmplay-history-empty">No search history yet. Play or pick a release to start.</div>';
            return;
        }
        const ul = document.createElement('ul');
        ul.className = 'swarmplay-history-list';
        entries.forEach((entry) => {
            const id = entry.id || entry.Id;
            const pinned = !!(entry.pinned || entry.Pinned);
            const year = entry.year || entry.Year || '';
            const release = entry.lastReleaseTitle || entry.LastReleaseTitle || '';
            const li = document.createElement('li');
            li.className = 'swarmplay-history-row';
            li.innerHTML = `
                <div class="body" tabindex="0" role="button">
                    <div>
                        ${pinned ? '<span class="pin-badge">Pinned</span>' : ''}
                        <strong>${esc(entryTitle(entry))}</strong>
                        ${year ? ` <span class="meta">(${esc(year)})</span>` : ''}
                    </div>
                    <div class="meta">${esc(entryMediaType(entry))} · ${esc(formatWhen(entry))}
                        ${release ? ` · ${esc(release)}` : ''}
                    </div>
                </div>
                <div class="ops">
                    <button type="button" data-act="pin">${pinned ? 'Unpin' : 'Pin'}</button>
                    <button type="button" data-act="del">Remove</button>
                </div>`;
            li.querySelector('.body').addEventListener('click', () => openEntry(entry));
            li.querySelector('.body').addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    openEntry(entry);
                }
            });
            li.querySelector('[data-act="pin"]').addEventListener('click', async (ev) => {
                ev.stopPropagation();
                await JE.swarm.pinHistory(id);
                await renderList(panel);
            });
            li.querySelector('[data-act="del"]').addEventListener('click', async (ev) => {
                ev.stopPropagation();
                await JE.swarm.deleteHistory(id);
                await renderList(panel);
            });
            ul.appendChild(li);
        });
        host.innerHTML = '';
        host.appendChild(ul);
    }

    async function showPanel() {
        if (!JE.swarm?.listHistory) {
            if (typeof JE.toast === 'function') JE.toast('Swarmplay: history API not loaded', 4000);
            return;
        }
        ensureStyles();
        closePanel();
        const backdrop = document.createElement('div');
        backdrop.id = BACKDROP_ID;
        backdrop.className = 'swarmplay-history-backdrop';
        backdrop.innerHTML = `
            <div class="swarmplay-history-panel" role="dialog" aria-label="Swarmplay history">
                <header>
                    <button type="button" class="close" aria-label="Close">&times;</button>
                    <h2>History</h2>
                    <p class="sub">Recent Swarmplay searches &amp; plays — pin keepers, clear the rest</p>
                </header>
                <div class="toolbar">
                    <button type="button" data-act="clear">Clear unpinned</button>
                    <button type="button" data-act="refresh">Refresh</button>
                </div>
                <div data-history-list></div>
            </div>`;
        document.body.appendChild(backdrop);
        const panel = backdrop.querySelector('.swarmplay-history-panel');
        backdrop.querySelector('.close').onclick = closePanel;
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closePanel(); });
        panel.querySelector('[data-act="clear"]').onclick = async () => {
            await JE.swarm.clearHistory(false);
            await renderList(panel);
        };
        panel.querySelector('[data-act="refresh"]').onclick = () => renderList(panel);
        await renderList(panel);
    }

    function mountFloat() {
        if (!swarmDiscoveryOn()) {
            document.getElementById(FLOAT_ID)?.remove();
            return;
        }
        ensureStyles();
        let btn = document.getElementById(FLOAT_ID);
        if (!btn) {
            btn = document.createElement('button');
            btn.id = FLOAT_ID;
            btn.type = 'button';
            btn.textContent = 'History';
            btn.title = 'Swarmplay search history';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                showPanel();
            });
            document.body.appendChild(btn);
        }
    }

    function recordSearch(ctx) {
        if (!JE.swarm?.upsertHistory || !ctx) return;
        const title = String(ctx.title || ctx.query || '').trim();
        const year = ctx.year ? String(ctx.year) : '';
        const query = String(ctx.query || [title, year].filter(Boolean).join(' ')).trim();
        if (!query && !(ctx.tmdbId > 0)) return;
        const body = {
            Query: query || title,
            MediaType: ctx.mediaType || 'movie',
            TmdbId: ctx.tmdbId || null,
            Title: title || query,
            Year: year || null,
            SearchedAt: new Date().toISOString()
        };
        JE.swarm.upsertHistory(body).catch((e) => console.warn(logPrefix, 'recordSearch', e));
    }

    function recordPlay(ctx, bind, releaseTitle) {
        if (!JE.swarm?.upsertHistory || !ctx) return;
        const title = String(ctx.title || ctx.query || '').trim();
        const year = ctx.year ? String(ctx.year) : '';
        const query = String(ctx.query || [title, year].filter(Boolean).join(' ')).trim();
        const btih = (bind && (bind.Btih || bind.btih)) || '';
        const body = {
            Query: query || title,
            MediaType: ctx.mediaType || 'movie',
            TmdbId: ctx.tmdbId || null,
            Title: title || query,
            Year: year || null,
            LastPlayedAt: new Date().toISOString(),
            LastBtih: btih || null,
            LastReleaseTitle: releaseTitle || null
        };
        JE.swarm.upsertHistory(body).catch((e) => console.warn(logPrefix, 'recordPlay', e));
    }

    JE.swarmHistory = {
        show: showPanel,
        mountFloat,
        recordSearch,
        recordPlay,
        close: closePanel
    };

    // Keep the floating control on search/discovery routes.
    const tick = () => {
        try { mountFloat(); } catch (e) { /* ignore */ }
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tick);
    } else {
        tick();
    }
    setInterval(tick, 2500);
    document.addEventListener('viewshow', tick, true);
    console.log(`${logPrefix} loaded`);
})(window.JellyfinEnhanced);
