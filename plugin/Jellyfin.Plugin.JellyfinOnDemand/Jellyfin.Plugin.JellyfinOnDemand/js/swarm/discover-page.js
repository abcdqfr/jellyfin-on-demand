/**
 * JellyfinOnDemand Discover pane — Seerr Discover–shaped home (trending / popular /
 * upcoming / genre sliders) mounted next to Enhanced Panel + Bookmarks.
 *
 * Cards reuse JE.jellyseerrUI.createJellyseerrCard so Play / Lucky / Library
 * behave identically to search results. That card chrome is JE's former
 * Seerr/Jellyseerr *client* UI, rolled into this JellyfinOnDemand fork (GPL-3.0 JE
 * derivative — see ATTRIBUTION.md); data comes from
 * /JellyfinOnDemand/jellyseerr/discover/* (TMDB-backed when Seerr is off — ADR-004).
 *
 * Genre color tones + default slider titles/order: derived from
 * third-party/seerr src/components/Discover/{constants.ts,index.tsx}
 * Copyright (c) 2020 sct / seerr-team — MIT (see third-party/seerr/LICENSE
 * and ATTRIBUTION.md steal log).
 */
(function (JE) {
    'use strict';

    const logPrefix = '🪼 JellyfinOnDemand Discover:';
    const PAGE_ID = 'je-discover-standalone-page';
    const NAV_CLASS = 'je-nav-discover-item';
    // Two classes on one node — query as .sections.jellyfin-on-demand-discover (NOT
    // `.${SECTION_CLASS}`, which becomes ".sections jellyfin-on-demand-discover" and
    // matches a descendant tag name, leaving the pane empty).
    const SECTION_CLASS = 'sections jellyfin-on-demand-discover';
    const SECTION_SELECTOR = '.sections.jellyfin-on-demand-discover';

    /* Verbatim from seerr Discover/constants.ts colorTones + genreColorMap */
    const colorTones = {
        red: ['991B1B', 'FCA5A5'],
        darkred: ['1F2937', 'F87171'],
        blue: ['032541', '01b4e4'],
        lightblue: ['1F2937', '60A5FA'],
        darkblue: ['1F2937', '2864d2'],
        orange: ['92400E', 'FCD34D'],
        lightgreen: ['065F46', '6EE7B7'],
        green: ['087d29', '21cb51'],
        purple: ['5B21B6', 'C4B5FD'],
        yellow: ['777e0d', 'e4ed55'],
        darkorange: ['552c01', 'd47c1d'],
        black: ['1F2937', 'D1D5DB'],
        pink: ['9D174D', 'F9A8D4'],
        darkpurple: ['480c8b', 'a96bef']
    };
    const genreColorMap = {
        0: colorTones.black,
        28: colorTones.red,
        12: colorTones.darkpurple,
        16: colorTones.blue,
        35: colorTones.orange,
        80: colorTones.darkblue,
        99: colorTones.lightgreen,
        18: colorTones.pink,
        10751: colorTones.yellow,
        14: colorTones.lightblue,
        36: colorTones.orange,
        27: colorTones.black,
        10402: colorTones.blue,
        9648: colorTones.purple,
        10749: colorTones.pink,
        878: colorTones.lightblue,
        10770: colorTones.red,
        53: colorTones.black,
        10752: colorTones.darkred,
        37: colorTones.orange,
        10759: colorTones.darkpurple,
        10762: colorTones.blue,
        10763: colorTones.black,
        10764: colorTones.darkorange,
        10765: colorTones.lightblue,
        10766: colorTones.pink,
        10767: colorTones.lightgreen,
        10768: colorTones.darkred
    };

    const pageState = { pageVisible: false, previousPage: null, rendered: false };

    function discoveryEnabled() {
        return JE?.pluginConfig?.JellyfinOnDemandDiscoveryEnabled !== false;
    }

    function todayIsoDate() {
        const now = new Date();
        const offset = now.getTimezoneOffset();
        return new Date(now.getTime() - offset * 60 * 1000).toISOString().split('T')[0];
    }

    function ensureStyles() {
        if (document.getElementById('jellyfin-on-demand-discover-styles')) return;
        const s = document.createElement('style');
        s.id = 'jellyfin-on-demand-discover-styles';
        s.textContent = `
            .jellyfin-on-demand-discover { padding: 1rem 0 3rem; }
            .jellyfin-on-demand-discover .discover-page-header {
                display:flex; align-items:baseline; justify-content:space-between;
                gap:1rem; padding:0 1.25rem 1rem; flex-wrap:wrap;
            }
            .jellyfin-on-demand-discover .discover-page-header h1 {
                margin:0; font-size:1.75rem; font-weight:600; letter-spacing:.02em;
            }
            .jellyfin-on-demand-discover .discover-page-header .sub {
                opacity:.65; font-size:.9rem;
            }
            .jellyfin-on-demand-discover .discover-slider { margin-bottom:1.75rem; }
            .jellyfin-on-demand-discover .discover-slider .slider-title {
                display:inline-flex; align-items:center; gap:.4rem;
                margin:0 0 .6rem; padding:0 1.25rem;
                font-size:1.15rem; font-weight:600; color:inherit; text-decoration:none;
            }
            .jellyfin-on-demand-discover .discover-slider .slider-title .material-icons {
                font-size:1.1rem; opacity:.7;
            }
            .jellyfin-on-demand-discover .discover-slider .emby-scroller { padding-left:1.25rem; padding-right:1.25rem; }
            .jellyfin-on-demand-discover .discover-genre-card {
                display:inline-flex; align-items:flex-end; justify-content:flex-start;
                width:11.5rem; height:6.5rem; margin:0 .55rem .55rem 0;
                border-radius:10px; padding:.7rem .85rem; cursor:pointer;
                color:#fff; font-weight:700; font-size:.95rem; letter-spacing:.02em;
                text-shadow:0 1px 2px rgba(0,0,0,.45);
                box-shadow:0 6px 18px rgba(0,0,0,.28);
                vertical-align:top; border:none; background-size:cover; background-position:center;
                transition:transform .15s ease, box-shadow .15s ease;
            }
            .jellyfin-on-demand-discover .discover-genre-card:hover,
            .jellyfin-on-demand-discover .discover-genre-card:focus {
                transform:translateY(-2px); outline:none;
                box-shadow:0 10px 24px rgba(0,0,0,.4);
            }
            .jellyfin-on-demand-discover .discover-loading,
            .jellyfin-on-demand-discover .discover-empty {
                padding:2rem 1.25rem; opacity:.7;
            }
            .jellyfin-on-demand-discover-landing-link {
                display:inline-flex; align-items:center; gap:.45rem;
                margin:.75rem 0 1.25rem; padding:.65rem 1rem;
                border-radius:8px; background:rgba(86,215,255,.12);
                border:1px solid rgba(86,215,255,.35); color:#9be7ff;
                cursor:pointer; font-size:.92rem; text-decoration:none;
            }
            .jellyfin-on-demand-discover-landing-link:hover { background:rgba(86,215,255,.2); }
            .jellyfin-on-demand-discover-landing-link .material-icons { font-size:1.1rem; }
        `;
        document.head.appendChild(s);
    }

    function mediaCardsFragment(results) {
        const frag = document.createDocumentFragment();
        const create = JE.jellyseerrUI?.createJellyseerrCard;
        if (!create || !Array.isArray(results)) return frag;
        // Pass active+userFound=true so configureRequestButton reaches the
        // JellyfinOnDemand Play/Lucky/Library branch (same as discovery-filter-utils /
        // item-details). Server /user-status already reports active for JellyfinOnDemand.
        results.forEach((item) => {
            if (!item || (item.mediaType !== 'movie' && item.mediaType !== 'tv')) return;
            frag.appendChild(create(item, true, true));
        });
        return frag;
    }

    function buildScroller(fragment) {
        const scroller = document.createElement('div');
        scroller.setAttribute('is', 'emby-scroller');
        scroller.className = 'padded-top-focusscale padded-bottom-focusscale emby-scroller';
        scroller.dataset.horizontal = 'true';
        scroller.dataset.centerfocus = 'card';

        const items = document.createElement('div');
        items.setAttribute('is', 'emby-itemscontainer');
        items.className = 'focuscontainer-x itemsContainer scrollSlider';
        items.appendChild(fragment);
        scroller.appendChild(items);
        return scroller;
    }

    function createMediaSlider(title, results) {
        const wrap = document.createElement('div');
        wrap.className = 'discover-slider verticalSection emby-scroller-container';

        const h = document.createElement('h2');
        h.className = 'slider-title sectionTitle';
        h.innerHTML = `<span>${title}</span><span class="material-icons" aria-hidden="true">arrow_forward</span>`;
        wrap.appendChild(h);

        if (!results || !results.length) {
            const empty = document.createElement('div');
            empty.className = 'discover-empty';
            empty.textContent = 'Nothing here right now.';
            wrap.appendChild(empty);
            return wrap;
        }
        wrap.appendChild(buildScroller(mediaCardsFragment(results)));
        return wrap;
    }

    function hexToCss(hex) {
        return `#${hex}`;
    }

    function createGenreCard(genre, mediaType) {
        const tones = genreColorMap[genre.id] || genreColorMap[0];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'discover-genre-card';
        btn.textContent = genre.name || 'Genre';
        btn.style.backgroundImage =
            `linear-gradient(135deg, ${hexToCss(tones[0])} 0%, ${hexToCss(tones[1])} 100%)`;
        btn.title = `${genre.name} — ${mediaType === 'movie' ? 'Movies' : 'Series'}`;
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            try {
                const data = mediaType === 'movie'
                    ? await JE.jellyseerrAPI.fetchDiscoverMoviesByGenre(genre.id, 1)
                    : await JE.jellyseerrAPI.fetchDiscoverTvByGenre(genre.id, 1);
                const results = (data && data.results) || [];
                const host = document.querySelector(`#${PAGE_ID} ${SECTION_SELECTOR}`);
                if (!host) return;
                let detail = host.querySelector('.discover-genre-detail');
                if (detail) detail.remove();
                detail = createMediaSlider(
                    `${genre.name} ${mediaType === 'movie' ? 'Movies' : 'Series'}`,
                    results
                );
                detail.classList.add('discover-genre-detail');
                host.appendChild(detail);
                detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } finally {
                btn.disabled = false;
            }
        });
        return btn;
    }

    function createGenreSlider(title, genres, mediaType) {
        const wrap = document.createElement('div');
        wrap.className = 'discover-slider verticalSection';
        const h = document.createElement('h2');
        h.className = 'slider-title sectionTitle';
        h.innerHTML = `<span>${title}</span><span class="material-icons" aria-hidden="true">arrow_forward</span>`;
        wrap.appendChild(h);

        const scroller = document.createElement('div');
        scroller.className = 'padded-top-focusscale padded-bottom-focusscale emby-scroller';
        scroller.style.overflowX = 'auto';
        scroller.style.whiteSpace = 'nowrap';
        scroller.style.paddingLeft = '1.25rem';
        scroller.style.paddingRight = '1.25rem';
        (genres || []).forEach((g) => scroller.appendChild(createGenreCard(g, mediaType)));
        wrap.appendChild(scroller);
        return wrap;
    }

    async function renderDiscover(container) {
        ensureStyles();
        container.innerHTML = '';
        const header = document.createElement('div');
        header.className = 'discover-page-header';
        header.innerHTML = `
            <div>
                <h1>Discover</h1>
                <div class="sub">Trending, popular, and upcoming — same Play / Lucky / Library as search</div>
            </div>`;
        container.appendChild(header);

        const loading = document.createElement('div');
        loading.className = 'discover-loading';
        loading.textContent = 'Loading Discover…';
        container.appendChild(loading);

        const upcoming = todayIsoDate();
        const api = JE.jellyseerrAPI;
        if (!api) {
            loading.textContent = 'Discover API not loaded.';
            return;
        }

        try {
            const [
                trending,
                popularMovies,
                popularTv,
                upcomingMovies,
                upcomingTv,
                movieGenres,
                tvGenres
            ] = await Promise.all([
                api.fetchDiscoverTrending(1, { timeWindow: 'day', mediaType: 'all' }),
                api.fetchDiscoverMovies(1),
                api.fetchDiscoverTv(1),
                api.fetchDiscoverMovies(1, { primaryReleaseDateGte: upcoming }),
                api.fetchDiscoverTv(1, { firstAirDateGte: upcoming }),
                api.fetchGenreSlider('movie'),
                api.fetchGenreSlider('tv')
            ]);

            loading.remove();

            // Order mirrors Seerr Discover defaults (minus arr/Plex-only sliders).
            container.appendChild(createMediaSlider('Trending', trending?.results));
            container.appendChild(createMediaSlider('Popular Movies', popularMovies?.results));
            container.appendChild(createGenreSlider('Movie Genres', movieGenres, 'movie'));
            container.appendChild(createMediaSlider('Upcoming Movies', upcomingMovies?.results));
            container.appendChild(createMediaSlider('Popular Series', popularTv?.results));
            container.appendChild(createGenreSlider('Series Genres', tvGenres, 'tv'));
            container.appendChild(createMediaSlider('Upcoming Series', upcomingTv?.results));
            pageState.rendered = true;
        } catch (e) {
            console.error(logPrefix, 'render failed', e);
            loading.textContent = 'Failed to load Discover. Check TMDB API key / network.';
        }
    }

    function findActiveContainer() {
        const page = document.getElementById(PAGE_ID);
        return page?.querySelector(SECTION_SELECTOR) || document.querySelector(SECTION_SELECTOR);
    }

    function renderIfSectionExists() {
        const container = findActiveContainer();
        if (!container) return;
        if (pageState.rendered && container.childElementCount > 0) return;
        renderDiscover(container);
    }

    function createPageContainer() {
        let page = document.getElementById(PAGE_ID);
        if (!page) {
            page = document.createElement('div');
            page.id = PAGE_ID;
            page.className = 'page type-interior mainAnimatedPage hide';
            page.setAttribute('data-title', 'Discover');
            page.setAttribute('data-backbutton', 'true');
            page.setAttribute('data-url', '#');
            page.setAttribute('data-type', 'custom');

            const contentWrapper = document.createElement('div');
            contentWrapper.setAttribute('data-role', 'content');
            const contentPrimary = document.createElement('div');
            contentPrimary.className = 'content-primary je-discover-page';
            const container = document.createElement('div');
            container.className = SECTION_CLASS;
            contentPrimary.appendChild(container);
            contentWrapper.appendChild(contentPrimary);
            page.appendChild(contentWrapper);

            const mainContent = document.querySelector('.mainAnimatedPages');
            if (mainContent) mainContent.appendChild(page);
            else document.body.appendChild(page);
        }
        return page;
    }

    function showPage() {
        if (pageState.pageVisible) return;
        if (!discoveryEnabled()) return;

        pageState.pageVisible = true;
        const page = createPageContainer();

        const activePage = document.querySelector(`.mainAnimatedPage:not(.hide):not(#${PAGE_ID})`);
        if (activePage) {
            pageState.previousPage = activePage;
            activePage.classList.add('hide');
            activePage.dispatchEvent(new CustomEvent('viewhide', { bubbles: true, detail: { type: 'interior' } }));
        }

        page.classList.remove('hide');
        page.dispatchEvent(new CustomEvent('viewshow', { bubbles: true, detail: { type: 'custom' } }));
        // Prefer the container we just mounted — don't rely on a global query that
        // can miss when the class selector is wrong or another shell exists.
        const container = page.querySelector(SECTION_SELECTOR) || findActiveContainer();
        if (container) {
            if (!(pageState.rendered && container.childElementCount > 0)) {
                renderDiscover(container);
            }
        } else {
            console.error(`${logPrefix} no discover container after createPageContainer`);
        }
        setActiveNav(true);
    }

    function hidePage() {
        if (!pageState.pageVisible) return;
        const page = document.getElementById(PAGE_ID);
        if (page) {
            page.classList.add('hide');
            page.dispatchEvent(new CustomEvent('viewhide', { bubbles: true, detail: { type: 'custom' } }));
        }
        // Never restore the previous JF page on top of the real player / item
        // details — Discover is a custom stack page and must yield completely.
        const hash = window.location.hash || '';
        const takeover = !!(
            document.querySelector('.videoOsdBottom, #videoOsdPage, video.htmlvideoplayer, .htmlvideoplayer')
            || hash.startsWith('#/video')
            || hash.includes('details?id=')
            || document.querySelector('#itemDetailPage:not(.hide), .itemDetailPage:not(.hide)')
        );
        if (
            pageState.previousPage
            && !takeover
            && !document.querySelector(`.mainAnimatedPage:not(.hide):not(#${PAGE_ID})`)
        ) {
            pageState.previousPage.classList.remove('hide');
            pageState.previousPage.dispatchEvent(new CustomEvent('viewshow', { bubbles: true, detail: { type: 'interior', isRestored: true } }));
        }
        pageState.pageVisible = false;
        pageState.previousPage = null;
        setActiveNav(false);
    }

    function setActiveNav(active) {
        document.querySelectorAll(`.${NAV_CLASS}`).forEach((el) => {
            el.classList.toggle('navMenuOption-selected', !!active);
        });
    }

    function injectNavigation() {
        if (!discoveryEnabled()) return;
        if (document.querySelector(`.${NAV_CLASS}`)) return;

        const section = document.querySelector('.jellyfinEnhancedSection');
        if (!section) return;

        const navItem = document.createElement('a');
        navItem.setAttribute('is', 'emby-linkbutton');
        navItem.className = `navMenuOption lnkMediaFolder emby-button ${NAV_CLASS}`;
        navItem.href = '#';

        const iconSpan = document.createElement('span');
        iconSpan.className = 'navMenuOptionIcon material-icons';
        iconSpan.textContent = 'explore';
        navItem.appendChild(iconSpan);

        const textSpan = document.createElement('span');
        textSpan.className = 'sectionName navMenuOptionText';
        textSpan.textContent = 'Discover';
        navItem.appendChild(textSpan);

        navItem.addEventListener('click', (e) => {
            e.preventDefault();
            showPage();
        });

        // Place Discover first in the JellyfinOnDemand section (before Bookmarks / Calendar / …),
        // right under Enhanced Panel — Seerr's primary browse surface.
        const first = section.querySelector('.navMenuOption');
        if (first && first.nextSibling) {
            // After Enhanced Panel link if present
            const enhanced = section.querySelector('#jellyfinEnhancedSettingsLink');
            if (enhanced && enhanced.nextSibling) {
                section.insertBefore(navItem, enhanced.nextSibling);
            } else {
                section.insertBefore(navItem, first.nextSibling);
            }
        } else {
            section.appendChild(navItem);
        }
        console.log(`${logPrefix} Navigation item injected`);
    }

    function setupNavigationWatcher() {
        if (!discoveryEnabled()) return;
        const obs = new MutationObserver(() => {
            if (!document.querySelector(`.${NAV_CLASS}`)) injectNavigation();
            if (!pageState.pageVisible) return;
            const hash = window.location.hash || '';
            if (
                document.querySelector('.videoOsdBottom, #videoOsdPage, video.htmlvideoplayer, .htmlvideoplayer')
                || hash.startsWith('#/video')
                || hash.includes('details?id=')
            ) {
                hidePage();
            }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        // Also hide Discover when other nav is clicked
        document.addEventListener('click', (e) => {
            if (!pageState.pageVisible) return;
            const btn = e.target.closest('.headerTabs button, .navMenuOption, .headerButton');
            if (btn && !btn.classList.contains(NAV_CLASS)) hidePage();
        }, true);
        window.addEventListener('hashchange', () => {
            if (!pageState.pageVisible) return;
            const hash = window.location.hash || '';
            if (hash.startsWith('#/video') || hash.includes('details?id=')) hidePage();
        });
    }

    /** Landing-page entry on Jellyfin Search when the query is empty.
     * Disabled in 0.5.1 — link was broken / confusing; sidebar Discover stays. */
    function injectSearchLandingLink() {
        // Hotfix: do not inject. Strip any leftover link from older builds.
        document.querySelectorAll('.jellyfin-on-demand-discover-landing-link').forEach((el) => el.remove());
        return;
        if (!discoveryEnabled()) return;
        ensureStyles();
        const searchPage = document.querySelector('#searchPage');
        if (!searchPage) return;
        const input = searchPage.querySelector('#searchTextInput');
        const q = (input?.value || '').trim();

        let link = searchPage.querySelector('.jellyfin-on-demand-discover-landing-link');
        if (q) {
            link?.remove();
            return;
        }
        if (link) return;

        link = document.createElement('button');
        link.type = 'button';
        link.className = 'jellyfin-on-demand-discover-landing-link';
        link.innerHTML = `<span class="material-icons" aria-hidden="true">explore</span>
            <span>Browse Discover — trending, popular &amp; upcoming</span>`;
        link.addEventListener('click', (e) => {
            e.preventDefault();
            showPage();
        });

        const anchor =
            searchPage.querySelector('.searchFields, .searchInputContainer, .padded-left.padded-right')
            || searchPage.querySelector('.padded-top')
            || searchPage;
        if (anchor && anchor !== searchPage) {
            anchor.after(link);
        } else {
            searchPage.insertBefore(link, searchPage.firstChild);
        }
    }

    function watchSearchLanding() {
        if (!discoveryEnabled()) return;
        const tick = () => injectSearchLandingLink();
        tick();
        const obs = new MutationObserver(tick);
        obs.observe(document.body, { childList: true, subtree: true });
        document.addEventListener('input', (e) => {
            if (e.target && e.target.id === 'searchTextInput') tick();
        }, true);
        window.addEventListener('hashchange', tick);
    }

    JE.swarmShowDiscover = showPage;
    JE.swarmHideDiscover = hidePage;

    JE.initializeDiscoverPage = function () {
        if (!discoveryEnabled()) {
            console.log(`${logPrefix} skipped (JellyfinOnDemandDiscoveryEnabled=false)`);
            return;
        }
        ensureStyles();
        injectNavigation();
        setupNavigationWatcher();
        // watchSearchLanding(); — disabled 0.5.1 (broken search→Discover link)
        injectSearchLandingLink(); // only strips leftover links
        console.log(`${logPrefix} initialized`);
    };
})(window.JellyfinEnhanced);
