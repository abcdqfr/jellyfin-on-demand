(function (JE) {
    'use strict';

    const logPrefix = '🪼 Swarmplay releases:';
    const MAX_VISIBLE = 40;

    function formatBytes(n) {
        const v = Number(n) || 0;
        if (v <= 0) return 'size ?';
        if (v < 1e9) return `${(v / 1e6).toFixed(0)} MB`;
        return `${(v / 1e9).toFixed(1)} GB`;
    }

    function esc(s) {
        return String(s || '').replace(/</g, '&lt;');
    }

    function ensurePickerStyles() {
        if (document.getElementById('swarmplay-release-picker-styles')) return;
        const style = document.createElement('style');
        style.id = 'swarmplay-release-picker-styles';
        style.textContent = `
            .swarmplay-picker-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:99998; display:flex; align-items:center; justify-content:center; padding:1rem; }
            .swarmplay-picker { width:min(760px,100%); max-height:min(85vh,720px); overflow:auto; background:#1c1c1e; color:#f5f5f7; border-radius:10px; box-shadow:0 12px 40px rgba(0,0,0,.45); }
            .swarmplay-picker header { padding:1rem 1.1rem .5rem; position:sticky; top:0; background:#1c1c1e; z-index:1; }
            .swarmplay-picker h2 { margin:0; font-size:1.15rem; }
            .swarmplay-picker .sub { opacity:.7; margin:.35rem 0 0; font-size:.9rem; }
            .swarmplay-picker .filters { display:flex; flex-wrap:wrap; gap:.45rem; align-items:center; padding:.55rem 1.1rem .35rem; position:sticky; top:4.2rem; background:#1c1c1e; z-index:1; border-bottom:1px solid rgba(255,255,255,.08); }
            .swarmplay-picker .filters label { font-size:.8rem; opacity:.8; display:flex; gap:.3rem; align-items:center; }
            .swarmplay-picker .filters select, .swarmplay-picker .filters input {
                background:#2c2c2e; color:#f5f5f7; border:1px solid rgba(255,255,255,.15); border-radius:6px; padding:.25rem .4rem; font-size:.85rem; max-width:9rem;
            }
            .swarmplay-picker .filters input[type="number"] { width:3.2rem; }
            .swarmplay-picker .filters .count { margin-left:auto; font-size:.8rem; opacity:.65; }
            .swarmplay-picker ul { list-style:none; margin:0; padding:.25rem 0 1rem; }
            .swarmplay-picker li { margin:0 .75rem .45rem; padding:.7rem .85rem; border-radius:8px; background:rgba(255,255,255,.06); cursor:pointer; }
            .swarmplay-picker li:hover, .swarmplay-picker li:focus { background:rgba(86,215,255,.18); outline:none; }
            .swarmplay-picker .meta { opacity:.75; font-size:.85rem; margin-top:.25rem; }
            .swarmplay-picker .tag { display:inline-block; margin-right:.35rem; padding:.05rem .35rem; border-radius:4px; background:rgba(255,255,255,.1); font-size:.75rem; }
            .swarmplay-picker .close { float:right; background:transparent; border:0; color:inherit; font-size:1.4rem; cursor:pointer; line-height:1; }
            .swarmplay-picker .empty, .swarmplay-picker .loading { padding:1.25rem; opacity:.8; }
        `;
        document.head.appendChild(style);
    }

    function closePicker() {
        document.getElementById('swarmplay-picker-backdrop')?.remove();
    }

    function relTitle(rel) { return rel.title || rel.Title || 'release'; }
    function relSize(rel) { return rel.sizeBytes ?? rel.SizeBytes ?? rel.size ?? rel.Size ?? 0; }
    function relSeeders(rel) { return rel.seeders ?? rel.Seeders ?? 0; }
    function relIndexer(rel) { return rel.indexer || rel.Indexer || '?'; }

    function annotate(rel) {
        const title = relTitle(rel);
        const ranker = JE.swarmRanker || {};
        const ep = ranker.parseEpisode ? ranker.parseEpisode(title) : null;
        const group = ranker.parseGroup ? ranker.parseGroup(title) : '';
        const batch = ranker.isBatchRelease ? ranker.isBatchRelease(title, relSize(rel)) : false;
        return { rel, title, ep, group, batch };
    }

    function buildSearchQuery(ctx) {
        // Broad title(+year) search; Episode/Batch/Group filters narrow the list in-UI.
        const title = String(ctx.title || ctx.query || '').trim();
        const year = ctx.year ? String(ctx.year) : '';
        return [title, year].filter(Boolean).join(' ');
    }

    async function playRelease(release, ctx, filters) {
        closePicker();
        const title = ctx.title || relTitle(release);
        if (typeof JE.toast === 'function') {
            JE.toast(`Swarmplay: warming swarm for ${relTitle(release)}…`, 5000);
        }
        const btih = release.btih || release.Btih
            || (JE.swarmMagnet && JE.swarmMagnet.parse(release.magnet || release.Magnet));
        const isTv = ctx.mediaType === 'tv';
        const bind = await JE.swarm.playBind({
            Btih: btih || '',
            Magnet: btih ? null : (release.magnet || release.Magnet || null),
            FileIndex: 0,
            Season: isTv ? Number(filters.season) || 1 : null,
            Episode: isTv && filters.kind === 'episode' ? (Number(filters.episode) || 1) : null,
            MediaType: ctx.mediaType || null,
            TailMib: 8,
            HeadMib: 8
        });
        const ready = !!(bind && (bind.ready === true || bind.Ready === true));
        const path = bind?.path || bind?.Path;
        if (!ready || !path) {
            const why = (JE.swarm && JE.swarm.formatError)
                ? JE.swarm.formatError(bind)
                : (bind?.Message || bind?.message || bind?.Error || bind?.error || 'not ready');
            if (typeof JE.toast === 'function') JE.toast(`Swarmplay: ${why}`, 7000);
            return;
        }

        if (typeof JE.toast === 'function') {
            JE.toast(`Swarmplay: starting playback…`, 3000);
        }
        const attempt = typeof JE.swarmAttemptPlayback === 'function'
            ? await JE.swarmAttemptPlayback(bind, title)
            : { ok: false, reason: 'no_attempt_fn' };

        const ok = attempt === true || !!(attempt && attempt.ok);
        const reason = attempt && attempt.reason;
        const url = attempt && attempt.url;

        if (ok) {
            if (typeof JE.toast === 'function') JE.toast(`Swarmplay: playing ${title}`, 4000);
            return;
        }

        console.warn(logPrefix, 'playback attempt failed', attempt);
        const detail = (attempt && attempt.message)
            || (reason === 'no_jellyfin_player'
                ? 'Jellyfin’s player is not available to this plugin — refusing a substitute player.'
                : (reason || 'unknown'));
        if (typeof JE.toast === 'function') {
            JE.toast(`Swarmplay: warm, but no Jellyfin playback (${detail})`, 9000);
        }
    }

    function filterAnnotated(annotated, filters, mediaType) {
        return annotated.filter((row) => {
            if (filters.group && row.group.toLowerCase() !== filters.group.toLowerCase()) {
                return false;
            }
            if (mediaType === 'tv') {
                if (filters.kind === 'batch') {
                    if (!row.batch) return false;
                } else {
                    // episodic: prefer matching S/E; allow unknown-ep titles only if no SxxExx at all
                    if (row.batch) return false;
                    if (row.ep) {
                        if (row.ep.season !== Number(filters.season)) return false;
                        if (row.ep.episode !== Number(filters.episode)) return false;
                    }
                }
            }
            if (filters.text) {
                const q = filters.text.toLowerCase();
                if (!row.title.toLowerCase().includes(q)) return false;
            }
            return true;
        });
    }

    function renderList(panel, annotated, filters, ctx) {
        panel.querySelector('ul')?.remove();
        panel.querySelector('.empty')?.remove();
        const filtered = filterAnnotated(annotated, filters, ctx.mediaType);
        const countEl = panel.querySelector('.filters .count');
        if (countEl) {
            countEl.textContent = `${Math.min(filtered.length, MAX_VISIBLE)} / ${filtered.length} shown (${annotated.length} total)`;
        }
        if (!filtered.length) {
            const empty = document.createElement('div');
            empty.className = 'empty';
            empty.textContent = 'No releases match these filters. Widen episode/group or switch Episode ↔ Batch.';
            panel.appendChild(empty);
            return;
        }
        const ul = document.createElement('ul');
        filtered.slice(0, MAX_VISIBLE).forEach((row, i) => {
            const li = document.createElement('li');
            li.tabIndex = 0;
            const tags = [];
            if (row.ep) tags.push(`S${String(row.ep.season).padStart(2, '0')}E${String(row.ep.episode).padStart(2, '0')}`);
            if (row.batch) tags.push('batch');
            if (row.group) tags.push(row.group);
            li.innerHTML = `
                <div><strong>#${i + 1}</strong> ${esc(row.title)}</div>
                <div class="meta">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}
                    ${formatBytes(relSize(row.rel))} · ${relSeeders(row.rel)} seeders · ${esc(relIndexer(row.rel))}</div>`;
            const go = () => playRelease(row.rel, ctx, filters);
            li.addEventListener('click', go);
            li.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); }
            });
            ul.appendChild(li);
        });
        panel.appendChild(ul);
    }

    function mountFilters(panel, annotated, ctx, onChange) {
        const isTv = ctx.mediaType === 'tv';
        const groups = [...new Set(annotated.map((r) => r.group).filter(Boolean))].sort(
            (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })
        );
        const wrap = document.createElement('div');
        wrap.className = 'filters';
        wrap.innerHTML = `
            ${isTv ? `
            <label>Kind
                <select data-f="kind">
                    <option value="episode">Episode</option>
                    <option value="batch">Batch / season</option>
                </select>
            </label>
            <label>S <input data-f="season" type="number" min="1" max="99" value="${Number(ctx.season) || 1}"></label>
            <label>E <input data-f="episode" type="number" min="1" max="999" value="${Number(ctx.episode) || 1}"></label>
            ` : ''}
            <label>Group
                <select data-f="group">
                    <option value="">Any group</option>
                    ${groups.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join('')}
                </select>
            </label>
            <label>Contains <input data-f="text" type="search" placeholder="filter…"></label>
            <span class="count"></span>
        `;
        panel.querySelector('header')?.after(wrap);

        const read = () => ({
            kind: wrap.querySelector('[data-f="kind"]')?.value || 'episode',
            season: Number(wrap.querySelector('[data-f="season"]')?.value) || 1,
            episode: Number(wrap.querySelector('[data-f="episode"]')?.value) || 1,
            group: wrap.querySelector('[data-f="group"]')?.value || '',
            text: wrap.querySelector('[data-f="text"]')?.value || ''
        });

        const epInput = wrap.querySelector('[data-f="episode"]');
        const syncEpVisibility = () => {
            if (!epInput) return;
            const kind = wrap.querySelector('[data-f="kind"]')?.value;
            epInput.closest('label').style.display = kind === 'batch' ? 'none' : '';
        };
        syncEpVisibility();

        wrap.addEventListener('input', () => { syncEpVisibility(); onChange(read()); });
        wrap.addEventListener('change', () => { syncEpVisibility(); onChange(read()); });
        return read;
    }

    JE.swarmShowReleasePicker = async function (ctx) {
        ensurePickerStyles();
        closePicker();
        ctx = ctx || {};
        const filters0 = {
            kind: 'episode',
            season: Number(ctx.season) || 1,
            episode: Number(ctx.episode) || 1,
            group: '',
            text: ''
        };
        const query = buildSearchQuery(ctx) || String(ctx.query || ctx.title || '').trim();
        if (!query) {
            if (typeof JE.toast === 'function') JE.toast('Swarmplay: empty search query', 3000);
            return;
        }

        const backdrop = document.createElement('div');
        backdrop.id = 'swarmplay-picker-backdrop';
        backdrop.className = 'swarmplay-picker-backdrop';
        backdrop.innerHTML = `
            <div class="swarmplay-picker" role="dialog" aria-label="Swarmplay releases">
                <header>
                    <button type="button" class="close" aria-label="Close">&times;</button>
                    <h2>${esc(ctx.title || query)}</h2>
                    <p class="sub">Ranked Torznab — filter, then pick to warm &amp; play</p>
                </header>
                <div class="loading">Searching indexers…</div>
            </div>`;
        document.body.appendChild(backdrop);
        backdrop.querySelector('.close').onclick = closePicker;
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closePicker(); });

        const data = await JE.swarm.searchTorznab(query);
        const panel = backdrop.querySelector('.swarmplay-picker');
        const results = (data && data.results) || [];
        if (!results.length) {
            panel.querySelector('.loading')?.remove();
            const empty = document.createElement('div');
            empty.className = 'empty';
            empty.textContent = (data && (data.message || data.error))
                ? String(data.message || data.error)
                : 'No releases with magnets. Check Torznab / Prowlarr settings.';
            panel.appendChild(empty);
            return;
        }

        panel.querySelector('.loading')?.remove();
        // Drop weak title matches (e.g. "Straight To The A … XXX" vs "Straight A's to XXX 2017").
        const relevant = (JE.swarmRanker && JE.swarmRanker.filterRelevant)
            ? JE.swarmRanker.filterRelevant(results, query, 0.67)
            : results;
        if (!relevant.length) {
            const empty = document.createElement('div');
            empty.className = 'empty';
            empty.textContent = `No close title matches for “${query}”. Try another spelling or year.`;
            panel.appendChild(empty);
            console.log(logPrefix, `query="${query}" → 0 relevant of ${results.length}`);
            return;
        }
        const annotated = relevant.map(annotate);
        let filters = { ...filters0 };
        const readFilters = mountFilters(panel, annotated, ctx, (next) => {
            filters = next;
            renderList(panel, annotated, filters, ctx);
        });
        filters = readFilters();
        renderList(panel, annotated, filters, ctx);
        console.log(logPrefix, `query="${query}" → ${relevant.length} relevant of ${results.length}`);
    };

    JE.swarmReleases = { showPicker: JE.swarmShowReleasePicker };
})(window.JellyfinEnhanced);
