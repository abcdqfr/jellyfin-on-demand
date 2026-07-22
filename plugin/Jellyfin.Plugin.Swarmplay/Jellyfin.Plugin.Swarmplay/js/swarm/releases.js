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
            .swarmplay-picker li.preselect { outline:1px solid rgba(86,215,255,.55); background:rgba(86,215,255,.12); }
            .swarmplay-picker .ep-meta { opacity:.7; font-size:.8rem; }
            .swarmplay-ep-table { width:100%; border-collapse:collapse; font-size:.88rem; margin:0 0 1rem; }
            .swarmplay-ep-table th { position:sticky; top:0; background:#1c1c1e; text-align:left; padding:.5rem .7rem; cursor:pointer; user-select:none; opacity:.8; border-bottom:1px solid rgba(255,255,255,.14); white-space:nowrap; }
            .swarmplay-ep-table th:hover, .swarmplay-ep-table th:focus { opacity:1; outline:none; }
            .swarmplay-ep-table th.sort-asc::after { content:' \u25B2'; }
            .swarmplay-ep-table th.sort-desc::after { content:' \u25BC'; }
            .swarmplay-ep-table td { padding:.45rem .7rem; border-bottom:1px solid rgba(255,255,255,.06); }
            .swarmplay-ep-table td.file { max-width:26rem; overflow:hidden; text-overflow:ellipsis; }
            .swarmplay-ep-table tbody tr { cursor:pointer; }
            .swarmplay-ep-table tbody tr:hover, .swarmplay-ep-table tbody tr:focus { background:rgba(86,215,255,.16); outline:none; }
            .swarmplay-ep-table tbody tr.preselect { outline:1px solid rgba(86,215,255,.55); background:rgba(86,215,255,.1); }
            .swarmplay-choice-row { display:flex; gap:.6rem; padding:0 1.1rem 1.1rem; }
            .swarmplay-choice { flex:1; padding:.7rem; border-radius:8px; border:1px solid rgba(255,255,255,.15); color:inherit; cursor:pointer; font-size:.95rem; }
            .swarmplay-choice.stream { background:#2c2c2e; }
            .swarmplay-choice.cache { background:#0f766e; color:#fff; border-color:transparent; }
            .swarmplay-choice:hover, .swarmplay-choice:focus { filter:brightness(1.12); outline:none; }
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

    const VIDEO_EXT = /\.(mkv|mp4|avi|m4v|ts|m2ts|webm)$/i;

    function isVideoPath(path) {
        return VIDEO_EXT.test(String(path || ''));
    }

    function isJunkPath(path) {
        const name = String(path || '').split(/[/\\]/).pop() || '';
        return /\b(sample|trailer|preview|rarbg)\b/i.test(name);
    }

    function formatFileLabel(file) {
        const path = file.path || file.Path || '';
        const base = path.split(/[/\\]/).pop() || path;
        const season = file.season ?? file.Season;
        const episode = file.episode ?? file.Episode;
        const tags = [];
        if (season != null && episode != null) {
            tags.push(`S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`);
        }
        return { base, tags, size: file.size ?? file.Size ?? 0 };
    }

    /** Sortable table (click any header to sort by that column, asc/desc toggle) —
     * replaces the old plain <ul> so batches with 12+ episodes are actually scannable. */
    function showEpisodePicker(release, ctx, filters, videoFiles) {
        return new Promise((resolve) => {
            ensurePickerStyles();
            closePicker();
            const wantS = Number(filters.season) || 1;
            const wantE = Number(filters.episode) || 1;
            const backdrop = document.createElement('div');
            backdrop.id = 'swarmplay-picker-backdrop';
            backdrop.className = 'swarmplay-picker-backdrop';
            backdrop.innerHTML = `
                <div class="swarmplay-picker" role="dialog" aria-label="Swarmplay episodes">
                    <header>
                        <button type="button" class="close" aria-label="Close">&times;</button>
                        <h2>${esc(ctx.title || relTitle(release))}</h2>
                        <p class="sub">Pick an episode inside this release — click a column to sort</p>
                    </header>
                    <table class="swarmplay-ep-table">
                        <thead><tr>
                            <th data-sort="index">#</th>
                            <th data-sort="season">S</th>
                            <th data-sort="episode">E</th>
                            <th data-sort="title">File</th>
                            <th data-sort="size">Size</th>
                        </tr></thead>
                        <tbody></tbody>
                    </table>
                </div>`;
            document.body.appendChild(backdrop);
            const finish = (file) => {
                closePicker();
                resolve(file || null);
            };
            backdrop.querySelector('.close').onclick = () => finish(null);
            backdrop.addEventListener('click', (e) => { if (e.target === backdrop) finish(null); });

            const rows = videoFiles.map((file) => {
                const idx = file.index ?? file.Index ?? 0;
                const { base, size } = formatFileLabel(file);
                return {
                    file, idx, base, size,
                    season: file.season ?? file.Season ?? null,
                    episode: file.episode ?? file.Episode ?? null
                };
            });
            const thead = backdrop.querySelector('thead');
            const tbody = backdrop.querySelector('tbody');
            let sortKey = rows.some((r) => r.episode != null) ? 'episode' : 'index';
            let sortDir = 1;

            const valueFor = (r) => {
                if (sortKey === 'season') return r.season ?? -1;
                if (sortKey === 'episode') return r.episode ?? -1;
                if (sortKey === 'size') return r.size;
                if (sortKey === 'title') return r.base.toLowerCase();
                return r.idx;
            };

            const render = () => {
                const sorted = [...rows].sort((a, b) => {
                    const av = valueFor(a);
                    const bv = valueFor(b);
                    if (av < bv) return -1 * sortDir;
                    if (av > bv) return 1 * sortDir;
                    return a.idx - b.idx;
                });
                tbody.innerHTML = '';
                sorted.forEach((r) => {
                    const pre = r.season === wantS && r.episode === wantE;
                    const tr = document.createElement('tr');
                    tr.tabIndex = 0;
                    if (pre) tr.classList.add('preselect');
                    tr.innerHTML = `
                        <td>${r.idx}</td>
                        <td>${r.season != null ? String(r.season).padStart(2, '0') : '—'}</td>
                        <td>${r.episode != null ? String(r.episode).padStart(2, '0') : '—'}</td>
                        <td class="file">${esc(r.base)}</td>
                        <td>${formatBytes(r.size)}</td>`;
                    const go = () => finish(r.file);
                    tr.addEventListener('click', go);
                    tr.addEventListener('keydown', (ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); }
                    });
                    tbody.appendChild(tr);
                });
                thead.querySelectorAll('th').forEach((th) => {
                    th.classList.remove('sort-asc', 'sort-desc');
                    if (th.dataset.sort === sortKey) th.classList.add(sortDir > 0 ? 'sort-asc' : 'sort-desc');
                });
                const preRow = tbody.querySelector('tr.preselect');
                if (preRow) preRow.focus();
            };

            thead.querySelectorAll('th').forEach((th) => {
                th.tabIndex = 0;
                const activate = () => {
                    if (sortKey === th.dataset.sort) sortDir *= -1;
                    else { sortKey = th.dataset.sort; sortDir = 1; }
                    render();
                };
                th.addEventListener('click', activate);
                th.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); activate(); }
                });
            });
            render();
        });
    }

    async function playBindAndStart(release, ctx, filters, fileIndex, season, episode, fileIndexExplicit, batchFiles) {
        // Leave Discover before warm/play so JF player/details are never buried under it.
        if (typeof JE.swarmHideDiscover === 'function') {
            try { JE.swarmHideDiscover(); } catch (_) { /* ignore */ }
        }
        const title = ctx.title || relTitle(release);
        const btih = release.btih || release.Btih
            || (JE.swarmMagnet && JE.swarmMagnet.parse(release.magnet || release.Magnet));
        if (typeof JE.swarmShowWarmOverlay === 'function') {
            JE.swarmShowWarmOverlay(`Warming swarm for ${relTitle(release)}…`, btih);
        } else if (typeof JE.toast === 'function') {
            JE.toast(`Swarmplay: warming swarm for ${relTitle(release)}…`, 8000);
        }
        let bind;
        try {
            bind = await JE.swarm.playBind({
                Btih: btih || '',
                Magnet: release.magnet || release.Magnet || null,
                FileIndex: fileIndex,
                FileIndexExplicit: !!fileIndexExplicit,
                Season: season,
                Episode: episode,
                MediaType: ctx.mediaType || null,
                DisplayName: title,
                TailMib: 8,
                HeadMib: 8
            });
        } finally {
            if (typeof JE.swarmHideWarmOverlay === 'function') JE.swarmHideWarmOverlay();
        }
        const ready = !!(bind && (bind.ready === true || bind.Ready === true));
        const path = bind?.path || bind?.Path;
        if (!ready || !path) {
            const why = (JE.swarm && JE.swarm.formatError)
                ? JE.swarm.formatError(bind)
                : (bind?.Message || bind?.message || bind?.Error || bind?.error || 'not ready');
            if (typeof JE.toast === 'function') JE.toast(`Swarmplay: ${why}`, 7000);
            return;
        }

        if (JE.swarmHistory && typeof JE.swarmHistory.recordPlay === 'function') {
            JE.swarmHistory.recordPlay(ctx, bind, relTitle(release));
        }

        if (typeof JE.swarmSetBatchSession === 'function') {
            if (Array.isArray(batchFiles) && batchFiles.length > 1) {
                JE.swarmSetBatchSession({
                    btih: btih || '',
                    magnet: release.magnet || release.Magnet || null,
                    files: batchFiles,
                    fileIndex,
                    ctx,
                    releaseTitle: relTitle(release)
                });
            } else {
                JE.swarmSetBatchSession(null); // not a batch — drop any stale prev/next hijack
            }
        }

        if (typeof JE.toast === 'function') {
            JE.toast(`Swarmplay: starting playback…`, 3000);
        }
        const attempt = typeof JE.swarmAttemptPlayback === 'function'
            ? await JE.swarmAttemptPlayback(bind, title)
            : { ok: false, reason: 'no_attempt_fn' };

        const ok = attempt === true || !!(attempt && attempt.ok);
        const reason = attempt && attempt.reason;

        if (ok) {
            if (attempt.message && typeof JE.toast === 'function') {
                JE.toast(`Swarmplay: ${attempt.message}`, 5000);
            } else if (typeof JE.toast === 'function') {
                JE.toast(`Swarmplay: playing ${title}`, 4000);
            }
            return;
        }

        console.warn(logPrefix, 'playback attempt failed', attempt);
        if (reason === 'opened_item_details') {
            if (typeof JE.toast === 'function') {
                JE.toast('Swarmplay: opened Jellyfin item — press Play in the normal player.', 6000);
            }
            return;
        }
        const detail = (attempt && attempt.message) || reason || 'unknown';
        if (typeof JE.toast === 'function') {
            JE.toast(`Swarmplay: warm, but no Jellyfin playback (${detail})`, 9000);
        }
    }

    /** Shared by playRelease + cacheRelease: TV opens the episode-picker table for
     * multi-file releases either way — "cache to library" is not a silent bulk grab
     * of whatever file_index happens to come first. Returns null if the user
     * cancelled the episode picker. */
    async function resolveFileSelection(release, ctx, filters) {
        const isTv = ctx.mediaType === 'tv';
        const btih = release.btih || release.Btih
            || (JE.swarmMagnet && JE.swarmMagnet.parse(release.magnet || release.Magnet));
        const magnet = release.magnet || release.Magnet || null;
        let fileIndex = 0;
        let season = isTv ? Number(filters.season) || 1 : null;
        let episode = isTv ? Number(filters.episode) || 1 : null;
        let explicit = false;
        let batchFiles = null;

        if (isTv && typeof JE.swarm.listFiles === 'function') {
            if (typeof JE.toast === 'function') {
                JE.toast('Swarmplay: reading torrent files…', 4000);
            }
            const listed = await JE.swarm.listFiles({
                Btih: btih || '',
                Magnet: magnet
            });
            const all = (listed && (listed.files || listed.Files)) || [];
            const videos = all.filter((f) => {
                const path = f.path || f.Path || '';
                return isVideoPath(path) && !isJunkPath(path);
            });
            if (videos.length > 1) {
                const picked = await showEpisodePicker(release, ctx, filters, videos);
                if (!picked) return null; // cancelled
                fileIndex = picked.index ?? picked.Index ?? 0;
                season = picked.season ?? picked.Season ?? season;
                episode = picked.episode ?? picked.Episode ?? episode;
                explicit = true;
                batchFiles = videos;
            } else if (videos.length === 1) {
                fileIndex = videos[0].index ?? videos[0].Index ?? 0;
                season = videos[0].season ?? videos[0].Season ?? season;
                episode = videos[0].episode ?? videos[0].Episode ?? episode;
                explicit = true;
            }
        } else if (isTv && (filters.kind === 'episode' || filters.kind === 'batch')) {
            // No listFiles — still pass S/E so server BatchFileIndex can try.
            episode = Number(filters.episode) || 1;
        }

        return { fileIndex, season, episode, explicit, batchFiles };
    }

    async function playRelease(release, ctx, filters) {
        const sel = await resolveFileSelection(release, ctx, filters);
        closePicker();
        if (!sel) return; // cancelled
        await playBindAndStart(release, ctx, filters, sel.fileIndex, sel.season, sel.episode, sel.explicit, sel.batchFiles);
    }

    async function cacheRelease(release, ctx, filters) {
        const sel = await resolveFileSelection(release, ctx, filters);
        closePicker();
        if (!sel) return; // cancelled
        await cacheBindAndStart(release, ctx, sel.fileIndex, sel.season, sel.episode, sel.explicit);
    }

    async function streamRelease(release, ctx, filters) {
        const sel = await resolveFileSelection(release, ctx, filters);
        closePicker();
        if (!sel) return; // cancelled
        await streamBindAndStart(release, ctx, sel.fileIndex, sel.season, sel.episode, sel.explicit);
    }

    /** 0.4 cache-to-library: kick off the whole-file download server-side, then
     * poll for completion — no ephemeral swarm cache, no virtual item; once
     * ready the server has already triggered a real Jellyfin library scan. */
    async function cacheBindAndStart(release, ctx, fileIndex, season, episode, fileIndexExplicit) {
        const title = ctx.title || relTitle(release);
        const btih = release.btih || release.Btih
            || (JE.swarmMagnet && JE.swarmMagnet.parse(release.magnet || release.Magnet));
        if (typeof JE.toast === 'function') {
            JE.toast(`Swarmplay: starting library download for ${relTitle(release)}…`, 6000);
        }
        const bind = await JE.swarm.cacheBind({
            Btih: btih || '',
            Magnet: release.magnet || release.Magnet || null,
            FileIndex: fileIndex,
            FileIndexExplicit: !!fileIndexExplicit,
            Season: season,
            Episode: episode,
            MediaType: ctx.mediaType || null,
            DisplayName: title
        });
        const btihResolved = (bind && (bind.btih || bind.Btih)) || btih || '';
        const err = bind && (bind.error || bind.Error);
        if (err) {
            const why = (JE.swarm && JE.swarm.formatError) ? JE.swarm.formatError(bind) : (bind.message || bind.Message || err);
            if (typeof JE.toast === 'function') JE.toast(`Swarmplay: ${why}`, 8000);
            return;
        }
        if (JE.swarmHistory && typeof JE.swarmHistory.recordSearch === 'function') {
            JE.swarmHistory.recordSearch(ctx);
        }
        if (typeof JE.toast === 'function') {
            JE.toast(`Swarmplay: downloading "${title}" straight into your library…`, 6000);
        }
        watchCacheProgress(btihResolved, fileIndex, ctx.mediaType, title);
    }

    /** Client-side poll only (no page reload persistence) — acceptable for
     * v1's "block/show progress until complete" cache-to-library flow. */
    function watchCacheProgress(btih, fileIndex, mediaType, title) {
        let tries = 0;
        const tick = async () => {
            tries += 1;
            const status = await JE.swarm.cacheStatus(btih, fileIndex, mediaType);
            const ready = !!(status && (status.ready === true || status.Ready === true));
            if (ready) {
                if (typeof JE.toast === 'function') JE.toast(`Swarmplay: "${title}" is now in your library.`, 6000);
                return;
            }
            const err = status && (status.error || status.Error);
            if (err) {
                const why = (JE.swarm && JE.swarm.formatError) ? JE.swarm.formatError(status) : (status.message || status.Message || err);
                if (typeof JE.toast === 'function') JE.toast(`Swarmplay: library download stopped — ${why}`, 8000);
                return;
            }
            if (tries > 4320) return; // ~12h ceiling at 10s ticks — stop polling a stalled forever-download
            setTimeout(tick, 10000);
        };
        tick();
    }

    /** "Stream" side of Add to Library (hotfix correction — this is a strmarr-style
     * pointer, NOT the same as the plain Play button): writes one .strm file into the
     * resolved Jellyfin library so the title becomes a real, permanent, browsable item.
     * Its content is the same authenticated on-demand stream URL as direct-play links
     * (JE.swarmStreamUrl) — nothing is downloaded now; Jellyfin fetches through the
     * swarm only once something actually opens the item. */
    async function streamBindAndStart(release, ctx, fileIndex, season, episode, fileIndexExplicit) {
        const title = ctx.title || relTitle(release);
        const btih = release.btih || release.Btih
            || (JE.swarmMagnet && JE.swarmMagnet.parse(release.magnet || release.Magnet));
        if (!btih) {
            if (typeof JE.toast === 'function') JE.toast('Swarmplay: no infohash for this release', 6000);
            return;
        }
        const streamUrl = typeof JE.swarmStreamUrl === 'function'
            ? JE.swarmStreamUrl({ Btih: btih, FileIndex: fileIndex })
            : null;
        if (!streamUrl) {
            if (typeof JE.toast === 'function') JE.toast('Swarmplay: could not build a stream URL', 6000);
            return;
        }
        if (typeof JE.toast === 'function') {
            JE.toast(`Swarmplay: adding "${title}" to your library as a stream…`, 6000);
        }
        const bind = await JE.swarm.streamBind({
            Btih: btih,
            Magnet: release.magnet || release.Magnet || null,
            FileIndex: fileIndex,
            FileIndexExplicit: !!fileIndexExplicit,
            Season: season,
            Episode: episode,
            MediaType: ctx.mediaType || null,
            DisplayName: title,
            StreamUrl: streamUrl
        });
        const ready = !!(bind && (bind.ready === true || bind.Ready === true));
        if (!ready) {
            const why = (JE.swarm && JE.swarm.formatError) ? JE.swarm.formatError(bind) : (bind?.Message || bind?.message || 'not ready');
            if (typeof JE.toast === 'function') JE.toast(`Swarmplay: ${why}`, 8000);
            return;
        }
        if (JE.swarmHistory && typeof JE.swarmHistory.recordSearch === 'function') {
            JE.swarmHistory.recordSearch(ctx);
        }
        if (typeof JE.toast === 'function') {
            JE.toast(`Swarmplay: "${title}" is now streamable from your library.`, 6000);
        }
    }

    /** Stream now, or download straight into a real Jellyfin library? */
    function showStreamOrCacheChooser(ctx) {
        return new Promise((resolve) => {
            ensurePickerStyles();
            closePicker();
            const backdrop = document.createElement('div');
            backdrop.id = 'swarmplay-picker-backdrop';
            backdrop.className = 'swarmplay-picker-backdrop';
            backdrop.innerHTML = `
                <div class="swarmplay-picker" role="dialog" aria-label="Swarmplay add to library" style="width:min(420px,100%);">
                    <header>
                        <button type="button" class="close" aria-label="Close">&times;</button>
                        <h2>${esc(ctx.title || ctx.query || 'title')}</h2>
                        <p class="sub">Add a permanent library entry — a .strm pointer that streams on demand, or a full download?</p>
                    </header>
                    <div class="swarmplay-choice-row">
                        <button type="button" data-choice="stream" class="swarmplay-choice stream">Stream (.strm)</button>
                        <button type="button" data-choice="cache" class="swarmplay-choice cache">Cache to library</button>
                    </div>
                </div>`;
            document.body.appendChild(backdrop);
            const finish = (choice) => { closePicker(); resolve(choice); };
            backdrop.querySelector('.close').onclick = () => finish(null);
            backdrop.addEventListener('click', (e) => { if (e.target === backdrop) finish(null); });
            backdrop.querySelector('[data-choice="stream"]').onclick = () => finish('stream');
            backdrop.querySelector('[data-choice="cache"]').onclick = () => finish('cache');
        });
    }

    /** New poster-hover "Add to Library" button entry point (ui.js). "Stream" writes a
     * .strm pointer (strmarr-style); "Cache to library" downloads the whole file. Neither
     * is the plain Play button's ephemeral, library-free flow. */
    JE.swarmAddToLibrary = async function (ctx) {
        ctx = ctx || {};
        const choice = await showStreamOrCacheChooser(ctx);
        if (!choice) return; // cancelled
        await JE.swarmShowReleasePicker(ctx, choice === 'cache' ? 'cache' : 'strm');
    };

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

    function renderList(panel, annotated, filters, ctx, mode) {
        panel.querySelector('ul')?.remove();
        panel.querySelector('.empty')?.remove();
        const filtered = filterAnnotated(annotated, filters, ctx.mediaType);
        const countEl = panel.querySelector('.filters .count');
        if (countEl) {
            countEl.textContent = `${Math.min(filtered.length, MAX_VISIBLE)} / ${filtered.length} shown (${annotated.length} total)`;
        }
        let rows = filtered;
        if (!rows.length && annotated.length) {
            rows = annotated; /* filter too tight — still show ranked hits */
            if (countEl) {
                countEl.textContent = `${Math.min(rows.length, MAX_VISIBLE)} / ${rows.length} shown (filters cleared — ${annotated.length} total)`;
            }
        }
        if (!rows.length) {
            const empty = document.createElement('div');
            empty.className = 'empty';
            empty.textContent = 'No Torznab releases for this title. Try Lucky or another query.';
            panel.appendChild(empty);
            return;
        }
        const ul = document.createElement('ul');
        rows.slice(0, MAX_VISIBLE).forEach((row, i) => {
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
            const go = () => {
                if (mode === 'cache') return cacheRelease(row.rel, ctx, filters);
                if (mode === 'strm') return streamRelease(row.rel, ctx, filters);
                return playRelease(row.rel, ctx, filters);
            };
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
                    <option value="batch" selected>Batch / season</option>
                    <option value="episode">Episode</option>
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
            kind: wrap.querySelector('[data-f="kind"]')?.value || 'batch',
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

    /** Same ranking the server's /lucky uses (search results already come back
     * RankReleases-ordered), so results[0] IS "rank #1" without a second server call. */
    async function pickTopRelease(ctx) {
        const query = buildSearchQuery(ctx) || String(ctx.query || ctx.title || '').trim();
        if (!query) return null;
        const data = await JE.swarm.searchTorznab(query);
        const results = (data && data.results) || [];
        if (!results.length) return null;
        const relevant = (JE.swarmRanker && JE.swarmRanker.filterRelevant)
            ? JE.swarmRanker.filterRelevant(results, query, 0.5)
            : results;
        return relevant[0] || results[0] || null;
    }

    /** Lucky, but reusing playRelease so TV still gets the episode-picker table —
     * "rank #1, no release picker" without silently skipping episode choice. */
    JE.swarmPlayLucky = async function (ctx) {
        ctx = ctx || {};
        if (typeof JE.toast === 'function') JE.toast('Swarmplay: finding top match…', 4000);
        const release = await pickTopRelease(ctx);
        if (!release) {
            if (typeof JE.toast === 'function') JE.toast('Swarmplay: no releases found', 5000);
            return;
        }
        if (JE.swarmHistory && typeof JE.swarmHistory.recordSearch === 'function') {
            JE.swarmHistory.recordSearch(ctx);
        }
        const filters = {
            season: Number(ctx.season) || 1,
            episode: Number(ctx.episode) || 1
        };
        await playRelease(release, ctx, filters);
    };

    JE.swarmShowReleasePicker = async function (ctx, mode) {
        mode = (mode === 'cache' || mode === 'strm') ? mode : 'play';
        ensurePickerStyles();
        closePicker();
        ctx = ctx || {};
        const filters0 = {
            kind: 'batch',
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
                    <p class="sub">${mode === 'cache'
        ? 'Ranked Torznab — filter, then pick to download straight into your library'
        : mode === 'strm'
            ? 'Ranked Torznab — filter, then pick to add a streamable .strm library entry'
            : 'Ranked Torznab — filter, then pick to warm &amp; play'}</p>
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
            ? JE.swarmRanker.filterRelevant(results, query, 0.5)
            : results;
        if (!relevant.length) {
            const empty = document.createElement('div');
            empty.className = 'empty';
            empty.textContent = `No close title matches for “${query}”. Try another spelling or year.`;
            panel.appendChild(empty);
            console.log(logPrefix, `query="${query}" → 0 relevant of ${results.length}`);
            return;
        }
        if (JE.swarmHistory && typeof JE.swarmHistory.recordSearch === 'function') {
            JE.swarmHistory.recordSearch(ctx);
        }
        const annotated = relevant.map(annotate);
        let filters = { ...filters0 };
        const readFilters = mountFilters(panel, annotated, ctx, (next) => {
            filters = next;
            renderList(panel, annotated, filters, ctx, mode);
        });
        filters = readFilters();
        renderList(panel, annotated, filters, ctx, mode);
        console.log(logPrefix, `query="${query}" → ${relevant.length} relevant of ${results.length}`);
    };

    JE.swarmReleases = {
        showPicker: JE.swarmShowReleasePicker,
        showEpisodePicker,
        isVideoPath,
        isJunkPath
    };
})(window.JellyfinEnhanced);
