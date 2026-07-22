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
                headers: authHeaders()
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
            metadata_timeout: 'Timed out waiting for torrent metadata. Try again or pick another release.',
            'native_error_-3': 'Timed out waiting for torrent metadata. Try again or pick another release.',
            invalid_file_index: 'That file is not in this torrent. Pick another file or release.',
            torznab_empty: 'No Torznab results. Check indexer URLs / Prowlarr.',
            no_magnet: 'Results had no magnets. Try another release.',
            not_ready: 'Still warming — not enough of the file is on disk yet.'
        };
        return map[code] || code || 'Swarm error.';
    };

    JE.swarm = api;
    console.log(`${logPrefix} swarm API loaded`);
})(window.JellyfinEnhanced);
