(function (JE) {
    'use strict';

    const logPrefix = '🪼 Swarmplay search:';
    const fixtures = [
        { id: 'fixture-2160', title: 'Example Film 2160p BluRay', resolution: '2160p', source: 'bluray', seeders: 42, size_bytes: 12000000000, language: 'en', indexer: 'nyaa' },
        { id: 'fixture-1080', title: 'Example Film 1080p WEB-DL', resolution: '1080p', source: 'web-dl', seeders: 180, size_bytes: 4500000000, language: 'en', indexer: 'tpb' },
        { id: 'fixture-720', title: 'Example Film 720p WEBRip', resolution: '720p', source: 'webrip', seeders: 90, size_bytes: 1800000000, language: 'en', indexer: 'nyaa' }
    ];

    function stubSearch(query) {
        const queryTitle = String(query || '').trim();
        if (!queryTitle) return [];
        return fixtures.map(release => ({ ...release, query_title: queryTitle }));
    }

    function hasConfiguredTorznab() {
        const config = JE.pluginConfig || {};
        return config.TorznabNyaaConfigured === true ||
            config.TorznabTpbConfigured === true ||
            Boolean(config.TorznabNyaaUrl || config.TorznabTpbUrl);
    }

    function ensureSearchIcon() {
        const anchor = document.querySelector('.searchFields .inputContainer') ||
            document.querySelector('#searchPage .searchFields');
        if (!anchor) return;

        let icon = document.getElementById('swarmplay-search-icon');
        if (!icon) {
            icon = document.createElement('span');
            icon.id = 'swarmplay-search-icon';
            icon.className = 'swarmplay-search-icon';
            icon.setAttribute('role', 'img');
            icon.setAttribute('aria-label', 'Swarmplay discovery enabled');
            icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 20.2 7v10L12 21.5 3.8 17V7L12 2.5Zm0 2.3L5.8 8.2v7.6l6.2 3.4 6.2-3.4V8.2L12 4.8Zm-2 4.3v6l5-3-5-3Z"/></svg>';
            anchor.appendChild(icon);
        }

        const suffix = hasConfiguredTorznab() ? '' : ' (fixtures — configure Torznab in plugin settings)';
        icon.title = `Swarmplay discovery enabled${suffix}`;
        icon.setAttribute('aria-label', icon.title);
        icon.classList.add('is-active');
    }

    function ensureSearchStyles() {
        if (document.getElementById('swarmplay-search-icon-styles')) return;
        const style = document.createElement('style');
        style.id = 'swarmplay-search-icon-styles';
        style.textContent = `
            #swarmplay-search-icon { position:absolute; right:10px; top:68%; transform:translateY(-50%); user-select:none; z-index:10; width:30px; height:50px; display:flex; align-items:center; justify-content:center; pointer-events:none; transition:filter .2s,opacity .2s,transform .2s; }
            #swarmplay-search-icon svg { width:24px; height:24px; fill:#56d7ff; filter:drop-shadow(0 0 5px rgba(123,92,255,.9)); }
            #swarmplay-search-icon.is-active { opacity:1; filter:drop-shadow(2px 2px 6px #000); }
            .searchFields .inputContainer { position:relative !important; }
        `;
        document.head.appendChild(style);
    }

    function renderRankedList(container, releases) {
        if (!container || typeof container.replaceChildren !== 'function') return [];
        const ranker = JE.ranker || JE.swarmRanker;
        const ranked = typeof ranker?.rank === 'function' ? ranker.rank(releases) : (releases || []).slice();
        const list = document.createElement('ul');
        list.className = 'swarmplay-release-list';
        list.style.cssText = 'list-style:none;margin:0;padding:0.5rem 0;display:flex;flex-direction:column;gap:0.35rem;';

        ranked.forEach(release => {
            const item = document.createElement('li');
            item.className = 'swarmplay-release-item';
            item.style.cssText = 'padding:0.6rem 0.8rem;border-radius:6px;background:rgba(255,255,255,0.06);cursor:pointer;';
            item.textContent = `${release.title} — ${release.resolution || 'unknown'} — ${release.seeders || 0} seeders (${release.indexer || '?'})`;
            item.title = 'Swarmplay fixture release (Torznab live search comes next)';
            item.addEventListener('click', () => {
                if (typeof JE.toast === 'function') {
                    JE.toast(`Swarmplay: selected ${release.title}`, 2500);
                }
                console.log(logPrefix, 'selected release', release);
            });
            list.appendChild(item);
        });
        container.replaceChildren(list);
        return ranked;
    }

    function ensureSection(searchPage) {
        let section = searchPage.querySelector('.swarmplay-section');
        if (section) return section;

        section = document.createElement('div');
        section.className = 'verticalSection swarmplay-section';
        const subtitle = hasConfiguredTorznab()
            ? 'Internal discovery (not Jellyseerr). Torznab indexers configured.'
            : 'Internal discovery (not Jellyseerr). Fixture releases until Torznab is configured.';
        section.innerHTML = `
            <div class="sectionTitleContainer sectionTitleContainer-cards">
                <h2 class="sectionTitle sectionTitle-cards">Swarmplay</h2>
                <p class="sectionTitleText" style="opacity:0.7;margin:0.25rem 0 0;">
                    ${subtitle}
                </p>
            </div>
            <div class="swarmplay-results itemsContainer"></div>
        `;

        const searchResults = searchPage.querySelector('.searchResults, [class*="searchResults"], .padded-top.padded-bottom-page');
        if (searchResults) {
            searchResults.insertBefore(section, searchResults.firstChild);
        } else {
            searchPage.appendChild(section);
        }
        return section;
    }

    function clearSection(searchPage) {
        const section = searchPage.querySelector('.swarmplay-section');
        if (section) section.remove();
    }

    function runSearch(query) {
        const searchPage = document.querySelector('#searchPage, .searchPage, [data-type="search"]')
            || document.querySelector('.searchResults')?.closest('.page');
        if (!searchPage) return;

        const q = String(query || '').trim();
        if (!q) {
            clearSection(searchPage);
            return;
        }

        const section = ensureSection(searchPage);
        const container = section.querySelector('.swarmplay-results');
        const releases = stubSearch(q);
        const ranked = renderRankedList(container, releases);
        console.log(logPrefix, `query="${q}" → ${ranked.length} fixture release(s)`);
    }

    JE.initializeSwarmSearch = function () {
        console.log(`${logPrefix} Initializing (internal — no Jellyseerr process)`);
        ensureSearchStyles();
        let lastQuery = null;
        let debounce = null;

        const onInput = (ev) => {
            const value = ev?.target?.value ?? '';
            clearTimeout(debounce);
            debounce = setTimeout(() => {
                if (value === lastQuery) return;
                lastQuery = value;
                runSearch(value);
            }, 250);
        };

        const attach = () => {
            const input = document.querySelector('#searchPage input[type="search"], #searchPage input[type="text"], .searchFields input, input[aria-label*="Search" i]');
            if (!input || input.dataset.swarmplayBound === '1') return !!input;
            input.dataset.swarmplayBound = '1';
            input.addEventListener('input', onInput);
            ensureSearchIcon();
            if (input.value?.trim()) runSearch(input.value);
            console.log(`${logPrefix} Bound to search input`);
            return true;
        };

        if (!attach()) {
            const obs = new MutationObserver(() => {
                if (attach()) obs.disconnect();
            });
            obs.observe(document.body, { childList: true, subtree: true });
        }

        // Hash / route changes to search
        window.addEventListener('hashchange', () => {
            setTimeout(() => {
                const input = document.querySelector('#searchPage input[type="search"], #searchPage input[type="text"], .searchFields input');
                if (input?.value?.trim()) runSearch(input.value);
            }, 100);
        });
    };

    JE.swarmReleases = { stubSearch, renderRankedList };
})(window.JellyfinEnhanced);
