// Swarmplay search history — inline browser-address-bar-style dropdown
// anchored under the native Jellyfin search field. No floating/omnipresent
// popup: the dropdown only appears while the search field has focus, exactly
// like a browser's field history — click a row to reopen it, "−" to remove
// one entry, "Clear history" to wipe all of it.
(function (JE) {
    'use strict';

    const logPrefix = 'swarmplay:history:';
    const DROPDOWN_ID = 'swarmplay-history-dropdown';
    const STYLE_ID = 'swarmplay-history-styles';
    const SEARCH_INPUT_SELECTOR = '#searchPage #searchTextInput';
    const MAX_ROWS = 8;

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
            #${DROPDOWN_ID} {
                position: fixed; z-index: 99990; background: #1c1c1e; color: #f5f5f7;
                border: 1px solid rgba(255,255,255,.16); border-radius: 8px;
                box-shadow: 0 10px 28px rgba(0,0,0,.4); overflow: hidden;
                max-height: min(60vh, 420px); overflow-y: auto;
            }
            #${DROPDOWN_ID} .row {
                display: flex; align-items: center; gap: .6rem;
                padding: .5rem .7rem; cursor: pointer; font-size: .88rem;
                border-bottom: 1px solid rgba(255,255,255,.06);
            }
            #${DROPDOWN_ID} .row:last-of-type { border-bottom: 0; }
            #${DROPDOWN_ID} .row:hover, #${DROPDOWN_ID} .row.active { background: rgba(255,255,255,.08); }
            #${DROPDOWN_ID} .row .icon { opacity: .55; flex: 0 0 auto; }
            #${DROPDOWN_ID} .row .text { flex: 1; min-width: 0; overflow: hidden; }
            #${DROPDOWN_ID} .row .title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            #${DROPDOWN_ID} .row .meta { opacity: .6; font-size: .76rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            #${DROPDOWN_ID} .row .remove {
                flex: 0 0 auto; background: transparent; border: 0; color: inherit; opacity: .55;
                width: 1.5rem; height: 1.5rem; border-radius: 4px; cursor: pointer; font-size: .95rem;
                line-height: 1; display: flex; align-items: center; justify-content: center;
            }
            #${DROPDOWN_ID} .row .remove:hover { opacity: 1; background: rgba(255,255,255,.12); }
            #${DROPDOWN_ID} .footer {
                display: flex; justify-content: flex-end; padding: .4rem .6rem;
                border-top: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.03);
            }
            #${DROPDOWN_ID} .footer button {
                background: transparent; border: 0; color: #9be7ff; font-size: .8rem;
                cursor: pointer; padding: .25rem .4rem;
            }
            #${DROPDOWN_ID} .footer button:hover { text-decoration: underline; }
            #${DROPDOWN_ID} .empty { padding: .7rem; opacity: .65; font-size: .85rem; }
        `;
        document.head.appendChild(style);
    }

    function getSearchInput() {
        return document.querySelector(SEARCH_INPUT_SELECTOR);
    }

    function getDropdown() {
        return document.getElementById(DROPDOWN_ID);
    }

    function closeDropdown() {
        document.getElementById(DROPDOWN_ID)?.remove();
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
        closeDropdown();
        const tmdbId = entryTmdbId(entry);
        const mediaType = entryMediaType(entry);
        const title = entryTitle(entry);
        const year = entry.year || entry.Year || null;
        const query = year ? `${title} ${year}` : entryQuery(entry);

        const input = getSearchInput();
        if (input) input.value = query;

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

    function matchesFilter(entry, needle) {
        if (!needle) return true;
        const hay = `${entryTitle(entry)} ${entryQuery(entry)}`.toLowerCase();
        return hay.includes(needle);
    }

    function positionDropdown(dropdown, input) {
        const rect = input.getBoundingClientRect();
        dropdown.style.left = `${Math.round(rect.left)}px`;
        dropdown.style.top = `${Math.round(rect.bottom + 4)}px`;
        dropdown.style.width = `${Math.round(rect.width)}px`;
    }

    async function renderRows(dropdown, input) {
        const needle = String(input.value || '').trim().toLowerCase();
        const data = await JE.swarm.listHistory();
        const all = (data && (data.entries || data.Entries)) || [];
        const filtered = all.filter((e) => matchesFilter(e, needle)).slice(0, MAX_ROWS);

        dropdown.innerHTML = '';
        if (!filtered.length) {
            const empty = document.createElement('div');
            empty.className = 'empty';
            empty.textContent = needle ? 'No matching history.' : 'No search history yet.';
            dropdown.appendChild(empty);
            if (all.length) appendFooter(dropdown, input);
            return;
        }

        filtered.forEach((entry) => {
            const id = entry.id || entry.Id;
            const year = entry.year || entry.Year || '';
            const row = document.createElement('div');
            row.className = 'row';
            row.setAttribute('role', 'option');
            row.tabIndex = 0;
            row.innerHTML = `
                <span class="icon">&#8635;</span>
                <span class="text">
                    <div class="title">${esc(entryTitle(entry))}${year ? ` <span style="opacity:.6">(${esc(year)})</span>` : ''}</div>
                    <div class="meta">${esc(entryMediaType(entry))} &middot; ${esc(formatWhen(entry))}</div>
                </span>
                <button type="button" class="remove" title="Remove from history" aria-label="Remove from history">&minus;</button>
            `;
            row.addEventListener('mousedown', (ev) => {
                // mousedown (not click) fires before the input's blur handler closes us.
                if (ev.target.closest('.remove')) return;
                ev.preventDefault();
                openEntry(entry);
            });
            row.querySelector('.remove').addEventListener('mousedown', async (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                await JE.swarm.deleteHistory(id);
                await renderRows(dropdown, input);
            });
            dropdown.appendChild(row);
        });
        appendFooter(dropdown, input);
    }

    function appendFooter(dropdown, input) {
        const footer = document.createElement('div');
        footer.className = 'footer';
        footer.innerHTML = '<button type="button" data-act="clear-all">Clear history</button>';
        footer.querySelector('[data-act="clear-all"]').addEventListener('mousedown', async (ev) => {
            ev.preventDefault();
            await JE.swarm.clearHistory(true);
            await renderRows(dropdown, input);
        });
        dropdown.appendChild(footer);
    }

    async function openDropdown(input) {
        if (!swarmDiscoveryOn() || !JE.swarm?.listHistory) return;
        ensureStyles();
        let dropdown = getDropdown();
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.id = DROPDOWN_ID;
            dropdown.setAttribute('role', 'listbox');
            document.body.appendChild(dropdown);
        }
        positionDropdown(dropdown, input);
        await renderRows(dropdown, input);
    }

    function wireSearchInput(input) {
        if (!input || input.dataset.swarmplayHistoryWired) return;
        input.dataset.swarmplayHistoryWired = 'true';

        input.addEventListener('focus', () => openDropdown(input));
        input.addEventListener('input', () => {
            if (getDropdown()) openDropdown(input);
        });
        input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape') closeDropdown();
        });
        window.addEventListener('resize', () => {
            const dropdown = getDropdown();
            if (dropdown) positionDropdown(dropdown, input);
        });
        document.addEventListener('mousedown', (ev) => {
            const dropdown = getDropdown();
            if (!dropdown) return;
            if (ev.target === input || dropdown.contains(ev.target)) return;
            closeDropdown();
        });
    }

    function tick() {
        if (!swarmDiscoveryOn()) {
            closeDropdown();
            return;
        }
        const input = getSearchInput();
        if (input) wireSearchInput(input);
        else closeDropdown();
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
        recordSearch,
        recordPlay,
        close: closeDropdown
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tick);
    } else {
        tick();
    }
    setInterval(tick, 2500);
    document.addEventListener('viewshow', () => { closeDropdown(); tick(); }, true);
    console.log(`${logPrefix} loaded`);
})(window.JellyfinEnhanced);
