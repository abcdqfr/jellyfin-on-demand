// Swarmplay control-plane stub (offline). No Seerr.
// Calls will hit plugin routes once C# SwarmController exists.
(function (JE) {
    'use strict';

    const logPrefix = 'swarmplay:';
    const api = {};

    function base() {
        // Until rename: JE route prefix. After rename: /Swarmplay
        return ApiClient.getUrl('/Swarmplay/swarm');
    }

    /**
     * @param {object} req
     * @param {string} req.btih
     * @param {number} [req.file_index=0]
     * @param {object} [req.warm]
     * @returns {Promise<{ path: string, ready: boolean }>}
     */
    api.ensure = async function (req) {
        console.warn(`${logPrefix} Ensure stub — not wired to native libtorrent yet`, req);
        const url = `${base()}/ensure`;
        try {
            return await ApiClient.ajax({
                type: 'POST',
                url,
                data: JSON.stringify(req),
                contentType: 'application/json',
                dataType: 'json'
            });
        } catch (e) {
            // Offline / pre-Wi‑Fi: return a clear stub so UI can develop against it.
            return {
                path: null,
                ready: false,
                error: 'swarm_ensure_unavailable',
                detail: String(e && e.message ? e.message : e)
            };
        }
    };

    api.status = async function (btih) {
        console.warn(`${logPrefix} Status stub`, btih);
        try {
            return await ApiClient.ajax({
                type: 'GET',
                url: `${base()}/status?btih=${encodeURIComponent(btih)}`,
                dataType: 'json'
            });
        } catch (e) {
            return { ready: false, error: 'swarm_status_unavailable' };
        }
    };

    api.stop = async function (btih, opts) {
        console.warn(`${logPrefix} Stop stub`, btih, opts);
        try {
            return await ApiClient.ajax({
                type: 'POST',
                url: `${base()}/stop`,
                data: JSON.stringify({ btih, ...(opts || {}) }),
                contentType: 'application/json',
                dataType: 'json'
            });
        } catch (e) {
            return { ok: false, error: 'swarm_stop_unavailable' };
        }
    };

    JE.swarm = api;
    console.log(`${logPrefix} swarm API stub loaded`);
})(window.JellyfinEnhanced);
