// Swarmplay control plane — Torznab search + Ensure/play-bind.
(function (JE) {
    'use strict';

    const logPrefix = 'swarmplay:';
    const api = {};

    function base() {
        return ApiClient.getUrl('/Swarmplay/swarm');
    }

    function authHeaders() {
        return {
            'X-Jellyfin-User-Id': ApiClient.getCurrentUserId(),
            Authorization: 'MediaBrowser Token="' + ApiClient.accessToken() + '"',
            'X-Emby-Token': ApiClient.accessToken()
        };
    }

    /** Fast Torznab search (server-ranked). */
    api.searchTorznab = async function (query) {
        const q = String(query || '').trim();
        if (!q) return { query: '', results: [] };
        const url = ApiClient.getUrl('/Swarmplay/swarm/torznab/search', { q });
        try {
            return await ApiClient.ajax({
                type: 'GET',
                url,
                dataType: 'json',
                headers: authHeaders()
            });
        } catch (e) {
            console.warn(logPrefix, 'torznab search failed', e);
            return { query: q, results: [], error: 'torznab_search_failed', message: String(e && e.message ? e.message : e) };
        }
    };

    api.ensure = async function (req) {
        const url = `${base()}/ensure`;
        try {
            return await ApiClient.ajax({
                type: 'POST',
                url,
                data: JSON.stringify(req),
                contentType: 'application/json',
                dataType: 'json',
                headers: authHeaders()
            });
        } catch (e) {
            return {
                path: null,
                ready: false,
                error: 'swarm_ensure_unavailable',
                message: 'Could not reach Ensure on this server.',
                detail: String(e && e.message ? e.message : e)
            };
        }
    };

    api.playBind = async function (req) {
        const url = `${base()}/play-bind`;
        try {
            return await ApiClient.ajax({
                type: 'POST',
                url,
                data: JSON.stringify(req),
                contentType: 'application/json',
                dataType: 'json',
                headers: authHeaders(),
                timeout: 240000
            });
        } catch (e) {
            return {
                Ready: false,
                ready: false,
                Error: 'play_bind_failed',
                error: 'play_bind_failed',
                Message: 'Play-bind request failed.',
                message: String(e && e.message ? e.message : e)
            };
        }
    };

    api.status = async function (btih) {
        try {
            return await ApiClient.ajax({
                type: 'GET',
                url: `${base()}/status?btih=${encodeURIComponent(btih)}`,
                dataType: 'json',
                headers: authHeaders()
            });
        } catch (e) {
            return { ready: false, error: 'swarm_status_unavailable', message: 'Status unavailable.' };
        }
    };

    api.stop = async function (btih, opts) {
        try {
            return await ApiClient.ajax({
                type: 'POST',
                url: `${base()}/stop?btih=${encodeURIComponent(btih)}&removeFiles=${opts && opts.removeFiles ? 'true' : 'false'}`,
                headers: authHeaders()
            });
        } catch (e) {
            return { ok: false, error: 'swarm_stop_unavailable' };
        }
    };

    /** Feeling lucky: Torznab → rank #1 → play-bind (server-side). */
    api.lucky = async function (req) {
        const url = `${base()}/lucky`;
        try {
            return await ApiClient.ajax({
                type: 'POST',
                url,
                data: JSON.stringify(req || {}),
                contentType: 'application/json',
                dataType: 'json',
                headers: authHeaders(),
                timeout: 240000
            });
        } catch (e) {
            return {
                Ready: false,
                ready: false,
                Error: 'lucky_failed',
                error: 'lucky_failed',
                Message: 'Feeling-lucky request failed.',
                message: String(e && e.message ? e.message : e)
            };
        }
    };

    // ── Search history (0.2) ──────────────────────────────────────────
    api.listHistory = async function () {
        try {
            return await ApiClient.ajax({
                type: 'GET',
                url: `${base()}/history`,
                dataType: 'json',
                headers: authHeaders()
            });
        } catch (e) {
            console.warn(logPrefix, 'listHistory failed', e);
            return { entries: [], error: 'history_list_failed', message: String(e && e.message ? e.message : e) };
        }
    };

    api.upsertHistory = async function (entry) {
        try {
            return await ApiClient.ajax({
                type: 'POST',
                url: `${base()}/history`,
                data: JSON.stringify(entry || {}),
                contentType: 'application/json',
                dataType: 'json',
                headers: authHeaders()
            });
        } catch (e) {
            console.warn(logPrefix, 'upsertHistory failed', e);
            return { error: 'history_upsert_failed', message: String(e && e.message ? e.message : e) };
        }
    };

    api.pinHistory = async function (id) {
        try {
            return await ApiClient.ajax({
                type: 'POST',
                url: `${base()}/history/${encodeURIComponent(id)}/pin`,
                dataType: 'json',
                headers: authHeaders()
            });
        } catch (e) {
            console.warn(logPrefix, 'pinHistory failed', e);
            return { error: 'history_pin_failed', message: String(e && e.message ? e.message : e) };
        }
    };

    api.deleteHistory = async function (id) {
        try {
            await ApiClient.ajax({
                type: 'DELETE',
                url: `${base()}/history/${encodeURIComponent(id)}`,
                headers: authHeaders()
            });
            return { ok: true };
        } catch (e) {
            console.warn(logPrefix, 'deleteHistory failed', e);
            return { ok: false, error: 'history_delete_failed', message: String(e && e.message ? e.message : e) };
        }
    };

    api.clearHistory = async function (all) {
        const url = `${base()}/history` + (all ? '?all=1' : '');
        try {
            return await ApiClient.ajax({
                type: 'DELETE',
                url,
                dataType: 'json',
                headers: authHeaders()
            });
        } catch (e) {
            console.warn(logPrefix, 'clearHistory failed', e);
            return { removed: 0, error: 'history_clear_failed', message: String(e && e.message ? e.message : e) };
        }
    };

    /** Prefer Message / message from server; fall back to known codes. */
    api.formatError = function (result) {
        if (!result) return 'Unknown swarm error.';
        const msg = result.Message || result.message;
        if (msg) return msg;
        const code = result.Error || result.error || '';
        const map = {
            invalid_argument: 'Invalid torrent identity — the infohash or magnet was rejected (often a corrupted magnet string). Try another release.',
            'native_error_-2': 'Invalid torrent identity — the infohash or magnet was rejected (often a corrupted magnet string). Try another release.',
            io_error: 'Cannot write the swarm cache directory (check SWARMPLAY_CACHE_DIR permissions on disk).',
            'native_error_-5': 'Cannot write the swarm cache directory (check SWARMPLAY_CACHE_DIR permissions on disk).',
            metadata_unreachable: 'Dead pin: could not fetch torrent metadata (no usable peers/trackers). Try another release — not a player bug.',
            metadata_timeout: 'Dead pin: could not fetch torrent metadata (no usable peers/trackers). Try another release — not a player bug.',
            dead_pin: 'Dead pin: could not fetch torrent metadata (no usable peers/trackers). Try another release — not a player bug.',
            'native_error_-3': 'Dead pin: could not fetch torrent metadata (no usable peers/trackers). Try another release — not a player bug.',
            invalid_file_index: 'That file is not in this torrent. Pick another file or release.',
            torznab_empty: 'No Torznab results. Check indexer URLs / Prowlarr.',
            no_magnet: 'Results had no magnets. Try another release.',
            not_ready: 'Still warming — not enough of the file is on disk yet.',
            extent_warm_timeout: 'Extent gate: head/tail not warm in time (strmarr PreparePlay). Try again or another release.'
        };
        return map[code] || code || 'Swarm error.';
    };

    JE.swarm = api;
    console.log(`${logPrefix} swarm API loaded`);
})(window.JellyfinEnhanced);
