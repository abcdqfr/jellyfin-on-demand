(function () {
    'use strict';

    const JE = window.JellyfinEnhanced;
    const logPrefix = 'swarmplay:';

    function parse(input) {
        const text = String(input || '').trim();
        const magnet = text.match(/magnet:\?[^\s"'<>]+/i)?.[0];
        let value = magnet ? new URL(magnet).searchParams.get('xt') : text;
        value = String(value || '').match(/(?:urn:btih:)?([a-f0-9]{40}|[a-z2-7]{32})/i)?.[1];
        return value ? value.toLowerCase() : null;
    }

    async function ensure(input) {
        const btih = parse(input);
        if (!btih) {
            const result = { ok: false, error: 'invalid_btih' };
            console.warn(`${logPrefix} invalid magnet/BTIH`, result);
            return result;
        }

        const result = await JE.swarm.ensure({ btih, file_index: 0 });
        console.log(`${logPrefix} magnet ensure`, { btih, result });
        return result;
    }

    JE.swarmMagnet = { parse, ensure };
})(window.JellyfinEnhanced);
