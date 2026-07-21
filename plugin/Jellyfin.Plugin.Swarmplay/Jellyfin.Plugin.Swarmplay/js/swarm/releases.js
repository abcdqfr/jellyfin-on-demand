(function (JE) {
    'use strict';

    const logPrefix = '🪼 Swarmplay releases:';

    function formatBytes(n) {
        const v = Number(n) || 0;
        if (v < 1e9) return `${(v / 1e6).toFixed(0)} MB`;
        return `${(v / 1e9).toFixed(1)} GB`;
    }

    function ensurePickerStyles() {
        if (document.getElementById('swarmplay-release-picker-styles')) return;
        const style = document.createElement('style');
        style.id = 'swarmplay-release-picker-styles';
        style.textContent = `
            .swarmplay-picker-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:99998; display:flex; align-items:center; justify-content:center; padding:1rem; }
            .swarmplay-picker { width:min(720px,100%); max-height:min(80vh,640px); overflow:auto; background:#1c1c1e; color:#f5f5f7; border-radius:10px; box-shadow:0 12px 40px rgba(0,0,0,.45); }
            .swarmplay-picker header { padding:1rem 1.1rem .5rem; position:sticky; top:0; background:#1c1c1e; z-index:1; }
            .swarmplay-picker h2 { margin:0; font-size:1.15rem; }
            .swarmplay-picker .sub { opacity:.7; margin:.35rem 0 0; font-size:.9rem; }
            .swarmplay-picker ul { list-style:none; margin:0; padding:.25rem 0 1rem; }
            .swarmplay-picker li { margin:0 .75rem .45rem; padding:.7rem .85rem; border-radius:8px; background:rgba(255,255,255,.06); cursor:pointer; }
            .swarmplay-picker li:hover, .swarmplay-picker li:focus { background:rgba(86,215,255,.18); outline:none; }
            .swarmplay-picker .meta { opacity:.75; font-size:.85rem; margin-top:.25rem; }
            .swarmplay-picker .close { float:right; background:transparent; border:0; color:inherit; font-size:1.4rem; cursor:pointer; line-height:1; }
            .swarmplay-picker .empty, .swarmplay-picker .loading { padding:1.25rem; opacity:.8; }
        `;
        document.head.appendChild(style);
    }

    function closePicker() {
        document.getElementById('swarmplay-picker-backdrop')?.remove();
    }

    async function playRelease(release, ctx) {
        closePicker();
        const title = ctx.title || release.title || 'title';
        if (typeof JE.toast === 'function') {
            JE.toast(`Swarmplay: starting ${release.title || title}…`, 3500);
        }
        const btih = release.btih || release.Btih || (JE.swarmMagnet && JE.swarmMagnet.parse(release.magnet || release.Magnet));
        const bind = await JE.swarm.playBind({
            Btih: btih || '',
            Magnet: btih ? null : (release.magnet || release.Magnet || null),
            FileIndex: 0,
            Season: ctx.season || null,
            Episode: ctx.episode || null,
            MediaType: ctx.mediaType || null,
            TailMib: 8,
            HeadMib: 8
        });
        const ready = !!(bind && (bind.ready === true || bind.Ready === true));
        const path = bind?.path || bind?.Path;
        if (ready && path) {
            const played = typeof JE.swarmAttemptPlayback === 'function'
                ? await JE.swarmAttemptPlayback(bind, title)
                : false;
            if (typeof JE.toast === 'function') {
                JE.toast(
                    played
                        ? `Swarmplay: playing ${title}`
                        : `Swarmplay: ready (file #${bind.FileIndex ?? bind.fileIndex ?? 0}) — virtual-item Play bind still open`,
                    5000
                );
            }
            return;
        }
        const why = (JE.swarm && JE.swarm.formatError)
            ? JE.swarm.formatError(bind)
            : (bind?.Message || bind?.message || bind?.Error || bind?.error || 'not ready');
        if (typeof JE.toast === 'function') {
            JE.toast(`Swarmplay: ${why}`, 7000);
        }
    }

    /**
     * Fast ranked Torznab list for one title. User picks → play-bind with S/E intelligence.
     * @param {{ query:string, title?:string, mediaType?:string, season?:number, episode?:number }} ctx
     */
    JE.swarmShowReleasePicker = async function (ctx) {
        ensurePickerStyles();
        closePicker();
        const query = String(ctx?.query || ctx?.title || '').trim();
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
                    <h2>${(ctx.title || query).replace(/</g, '&lt;')}</h2>
                    <p class="sub">Ranked Torznab results — pick one to play</p>
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
        const ul = document.createElement('ul');
        results.forEach((rel, i) => {
            const li = document.createElement('li');
            li.tabIndex = 0;
            const seeders = rel.seeders ?? rel.Seeders ?? 0;
            const size = rel.sizeBytes ?? rel.SizeBytes ?? 0;
            const indexer = rel.indexer || rel.Indexer || '?';
            li.innerHTML = `
                <div><strong>#${i + 1}</strong> ${(rel.title || rel.Title || 'release').replace(/</g, '&lt;')}</div>
                <div class="meta">${formatBytes(size)} · ${seeders} seeders · ${indexer}</div>`;
            const go = () => playRelease(rel, ctx);
            li.addEventListener('click', go);
            li.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); }
            });
            ul.appendChild(li);
        });
        panel.appendChild(ul);
        console.log(logPrefix, `query="${query}" → ${results.length} ranked release(s)`);
    };

    JE.swarmReleases = { showPicker: JE.swarmShowReleasePicker };
})(window.JellyfinEnhanced);
