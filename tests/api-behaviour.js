// Copyright © 2026 Snap Inc.
// SPDX-License-Identifier: MIT
//
// Pins the API's runtime contract on every transport: Android reply correlation across a double
// include, iOS synchronous-throw handling, init() degradation, and stub fidelity to native validation. Complements transport-selection.js (which transport is picked).
//
//   npm run build && node tests/api-behaviour.js
//
// No framework on purpose: the API ships as one plain file games bundle, and this runs anywhere node does.

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'dist', 'snap-api.js'), 'utf8');
// Same realm as the assertions (deepStrictEqual compares prototypes); `console` is shadowed so the stub's
// tracing stays out of the output.
// eslint-disable-next-line no-new-func
const install = new Function('window', 'console', src);
const quietConsole = { info() {}, warn() {}, error() {} };

function makeWindow(location) {
    const handlers = {};
    const win = {
        location,
        console: quietConsole,
        setTimeout,
        clearTimeout,
        addEventListener(type, fn) {
            (handlers[type] || (handlers[type] = [])).push(fn);
        },
        dispatchEvent(event) {
            (handlers[event.type] || []).forEach(fn => fn(event));
            return true;
        }
    };
    win.window = win;
    return win;
}

function load(win) {
    install(win, quietConsole);
    return win.snapchat;
}

async function rejectsWith(promise, code) {
    try {
        await promise;
    } catch (e) {
        assert.strictEqual(e.message, code);
        return;
    }
    assert.fail(`expected rejection ${code}`);
}

const tests = [];
function test(name, fn) {
    tests.push([name, fn]);
}

// ---------------------------------------------------------------------------------------------

test('Android: a double include reuses one instance and replies settle the right call', async () => {
    const sent = [];
    const listeners = [];
    const win = makeWindow({ protocol: 'https:', hostname: 'wlabc.web-lens.snap.local' });
    win.snapWebLensBridge = {
        postMessage(m) {
            sent.push(JSON.parse(m));
        },
        addEventListener(_type, fn) {
            listeners.push(fn);
        }
    };
    const first = load(win);
    const second = load(win);
    assert.strictEqual(first, second, 'second include must return the first instance');
    assert.strictEqual(listeners.length, 1, 'only one message listener registered');

    const a = first.bitmoji.getAvatarInfo();
    const b = first.leaderboards.show();
    assert.strictEqual(sent.length, 2);
    assert.notStrictEqual(sent[0].requestId, sent[1].requestId);
    assert.deepStrictEqual(sent[1], { requestId: sent[1].requestId, uri: 'app://leaderboards/present', params: {} });

    const aRejects = rejectsWith(a, 'ERR_INTERNAL');
    const reply = msg => listeners.forEach(fn => fn({ data: JSON.stringify(msg) }));
    reply({ requestId: sent[1].requestId, ok: true, payload: { ok: true, presented: true } });
    reply({ requestId: sent[0].requestId, ok: false, error: 'ERR_INTERNAL' });
    assert.strictEqual(await b, undefined);
    await aRejects;
});

test('Android: init() degrades to {} when the host does not know sdk/getCapabilities', async () => {
    const listeners = [];
    const win = makeWindow({ protocol: 'https:', hostname: 'wlabc.web-lens.snap.local' });
    let lastId;
    win.snapWebLensBridge = {
        postMessage(m) {
            lastId = JSON.parse(m).requestId;
        },
        addEventListener(_type, fn) {
            listeners.push(fn);
        }
    };
    const sdk = load(win);
    const init = sdk.init();
    listeners.forEach(fn => fn({ data: JSON.stringify({ requestId: lastId, ok: false, error: 'ERR_UNKNOWN_CAPABILITY' }) }));
    assert.deepStrictEqual(await init, {});
    assert.strictEqual(sdk.isSupported('leaderboards'), false);
});

test('Android: postMessage throwing rejects ERR_INTERNAL instead of hanging', async () => {
    const win = makeWindow({ protocol: 'https:', hostname: 'wlabc.web-lens.snap.local' });
    win.snapWebLensBridge = {
        postMessage() {
            throw new Error('detached');
        },
        addEventListener() {}
    };
    await rejectsWith(load(win).leaderboards.show(), 'ERR_INTERNAL');
});

test('iOS: a synchronous postMessage throw becomes a rejected promise', async () => {
    const win = makeWindow({ protocol: 'weblens:', hostname: 'lens' });
    const bridge = {
        postMessage() {
            throw new TypeError('DataCloneError');
        }
    };
    win.webkit = { messageHandlers: { snapWebLensBridge: bridge } };
    const sdk = load(win);
    let result;
    assert.doesNotThrow(() => {
        result = sdk.leaderboards.submitScore({ score: 1 });
    });
    await rejectsWith(result, 'ERR_INTERNAL');
});

test('iOS: native rejections surface as ERR_* codes only', async () => {
    const win = makeWindow({ protocol: 'weblens:', hostname: 'lens' });
    let nextReply;
    const bridge = {
        postMessage() {
            return nextReply;
        }
    };
    win.webkit = { messageHandlers: { snapWebLensBridge: bridge } };
    const sdk = load(win);
    nextReply = Promise.reject(new Error('ERR_INVALID_PARAMS'));
    await rejectsWith(sdk.leaderboards.submitScore({}), 'ERR_INVALID_PARAMS');
    nextReply = Promise.reject(new Error('WKErrorDomain 5'));
    await rejectsWith(sdk.leaderboards.show(), 'ERR_INTERNAL');
    nextReply = Promise.resolve({ capabilities: { leaderboards: 1, junk: 'x' } });
    assert.deepStrictEqual(await sdk.init(), { leaderboards: 1 });
    assert.strictEqual(sdk.isSupported('leaderboards', 2), false);
    assert.strictEqual(sdk.isSupported('leaderboards', 0), true);
    assert.strictEqual(sdk.isSupported('toString'), false);
});

test('iOS: the host\'s games_storage capability is storage in the API, and still games_storage on the wire', async () => {
    const win = makeWindow({ protocol: 'weblens:', hostname: 'lens' });
    const uris = [];
    const bridge = {
        postMessage(m) {
            uris.push(m.uri);
            return Promise.resolve(m.uri === 'app://sdk/getCapabilities' ? { capabilities: { games_storage: 1, leaderboards: 1 } } : { found: false });
        }
    };
    win.webkit = { messageHandlers: { snapWebLensBridge: bridge } };
    const sdk = load(win);
    assert.deepStrictEqual(await sdk.init(), { storage: 1, leaderboards: 1 });
    assert.strictEqual(sdk.isSupported('storage'), true);
    assert.strictEqual(sdk.isSupported('games_storage'), false);
    assert.deepStrictEqual(await sdk.storage.get('save'), { found: false });
    assert.strictEqual(uris[uris.length - 1], 'app://games_storage/get');
});

test('iOS: submitScore() resolves only the best score, which the host calls newScore', async () => {
    const win = makeWindow({ protocol: 'weblens:', hostname: 'lens' });
    let nextReply;
    const bridge = {
        postMessage() {
            return nextReply;
        }
    };
    win.webkit = { messageHandlers: { snapWebLensBridge: bridge } };
    const sdk = load(win);
    nextReply = Promise.resolve({ ok: true, submittedScore: 42, newScore: 40 });
    assert.deepStrictEqual(await sdk.leaderboards.submitScore({ score: 42 }), { bestScore: 40 });
    nextReply = Promise.resolve({ ok: true, submittedScore: 42 });
    assert.deepStrictEqual(await sdk.leaderboards.submitScore({ score: 42 }), {});
});

test('iOS: submitScore() sends the hosts a board id, which callers no longer pass', async () => {
    const win = makeWindow({ protocol: 'weblens:', hostname: 'lens' });
    const sent = [];
    const bridge = {
        postMessage(m) {
            sent.push(m);
            return Promise.resolve({ ok: true });
        }
    };
    win.webkit = { messageHandlers: { snapWebLensBridge: bridge } };
    const sdk = load(win);
    await sdk.leaderboards.submitScore({ score: 42 });
    await sdk.leaderboards.submitScore({ score: 42, ordering: 'ascending' });
    await sdk.leaderboards.submitScore({ leaderboardId: 'fastest-lap', score: 42 });
    assert.deepStrictEqual(sent.map(m => m.params), [
        { score: 42, leaderboardId: 'main' },
        { score: 42, ordering: 'ascending', leaderboardId: 'main' },
        { leaderboardId: 'fastest-lap', score: 42 }
    ]);
});

test('iOS: get2DAvatar() sends medium as the host\'s normal', async () => {
    const win = makeWindow({ protocol: 'weblens:', hostname: 'lens' });
    const sent = [];
    const bridge = {
        postMessage(m) {
            sent.push(m);
            return Promise.resolve({ url: 'blob:x' });
        }
    };
    win.webkit = { messageHandlers: { snapWebLensBridge: bridge } };
    const sdk = load(win);
    await sdk.bitmoji.get2DAvatar({ size: 'medium' });
    await sdk.bitmoji.get2DAvatar({ size: 'large' });
    await sdk.bitmoji.get2DAvatar();
    assert.deepStrictEqual(sent.map(m => m.params), [{ size: 'normal' }, { size: 'large' }, {}]);
    await rejectsWith(sdk.bitmoji.get2DAvatar({ size: 'normal' }), 'ERR_INVALID_PARAMS');
    assert.strictEqual(sent.length, 3, 'a rejected size never reaches the host');
});

test('Lens host without a bridge: init() resolves {} and calls reject ERR_UNSUPPORTED_HOST', async () => {
    const sdk = load(makeWindow({ protocol: 'weblens:', hostname: 'lens' }));
    assert.strictEqual(sdk.isStub, false);
    assert.deepStrictEqual(await sdk.init(), {});
    await rejectsWith(sdk.bitmoji.getAvatarInfo(), 'ERR_UNSUPPORTED_HOST');
});

test('global: window.snapchat is the API and window.SnapSDK is a deprecated alias of the same object', () => {
    const win = makeWindow({ protocol: 'http:', hostname: 'localhost' });
    const api = load(win);
    assert.strictEqual(win.snapchat, api);
    assert.strictEqual(win.SnapSDK, api);
    assert.strictEqual(api.version, '0.1.3');
});

test('stub: errors are frozen and every code is exposed', () => {
    const sdk = load(makeWindow({ protocol: 'http:', hostname: 'localhost' }));
    assert.ok(Object.isFrozen(sdk.errors));
    assert.deepStrictEqual(Object.keys(sdk.errors).sort(), [
        'INTERNAL', 'INVALID_PARAMS', 'MALFORMED_REQUEST', 'QUOTA_EXCEEDED', 'STORAGE_UNAVAILABLE', 'UNKNOWN_CAPABILITY', 'UNSUPPORTED_HOST'
    ]);
});

test('stub: leaderboards validate like native and echo the submitted score', async () => {
    const sdk = load(makeWindow({ protocol: 'http:', hostname: 'localhost' }));
    assert.deepStrictEqual(await sdk.init(), { leaderboards: 1, bitmoji: 1, storage: 1 });
    const r = await sdk.leaderboards.submitScore({ score: 42, ordering: 'ascending' });
    assert.deepStrictEqual(r, { bestScore: 42 });
    await rejectsWith(sdk.leaderboards.submitScore({}), 'ERR_INVALID_PARAMS');
    await rejectsWith(sdk.leaderboards.submitScore({ score: 1.5 }), 'ERR_INVALID_PARAMS');
    await rejectsWith(sdk.leaderboards.submitScore({ score: 1, ordering: 'up' }), 'ERR_INVALID_PARAMS');
    assert.strictEqual(await sdk.leaderboards.show(), undefined);
});

test('stub: bitmoji rejects participant everywhere, validates variant/size, never serves an empty url', async () => {
    const sdk = load(makeWindow({ protocol: 'http:', hostname: 'localhost' }));
    const { variants } = await sdk.bitmoji.getVariants();
    assert.ok(variants.length > 0);
    assert.ok((await sdk.bitmoji.get2DAvatar({ variant: variants[0], size: 'small' })).url.startsWith('data:image/png'));
    assert.ok((await sdk.bitmoji.get3DAvatar()).url.startsWith('data:model/gltf-binary'));
    await rejectsWith(sdk.bitmoji.get2DAvatar({ variant: '1' }), 'ERR_INVALID_PARAMS');
    await rejectsWith(sdk.bitmoji.get2DAvatar({ size: 'huge' }), 'ERR_INVALID_PARAMS');
    assert.ok((await sdk.bitmoji.get2DAvatar({ size: 'medium' })).url.startsWith('data:image/png'));
    // The hosts' own name for the middle size is not an alias.
    await rejectsWith(sdk.bitmoji.get2DAvatar({ size: 'normal' }), 'ERR_INVALID_PARAMS');
    await rejectsWith(sdk.bitmoji.get2DAvatar({ participant: 'p1' }), 'ERR_INVALID_PARAMS');
});

test('stub: storage round-trips JSON, enforces limits, reports info', async () => {
    const sdk = load(makeWindow({ protocol: 'http:', hostname: 'localhost' }));
    assert.deepStrictEqual(await sdk.storage.get('save'), { found: false });
    assert.strictEqual(await sdk.storage.set('save', { level: 3, items: ['a'] }), undefined);
    assert.deepStrictEqual(await sdk.storage.get('save'), { found: true, value: { level: 3, items: ['a'] } });
    await sdk.storage.set('b', 1);
    assert.deepStrictEqual(await sdk.storage.keys(), { keys: ['b', 'save'] });
    const info = await sdk.storage.getInfo();
    assert.strictEqual(info.keyCount, 2);
    assert.strictEqual(info.persistenceMode, 'memory');
    assert.ok(info.usedBytes > 0 && info.usedBytes < info.maxBytes);
    assert.deepStrictEqual(Object.keys(info).sort(), ['keyCount', 'maxBytes', 'maxKeys', 'maxValueBytes', 'persistenceMode', 'usedBytes']);
    assert.deepStrictEqual([info.maxBytes, info.maxKeys, info.maxValueBytes], [100 * 1024, 256, 32 * 1024]);
    await rejectsWith(sdk.storage.get(''), 'ERR_INVALID_PARAMS');
    await rejectsWith(sdk.storage.set('x', undefined), 'ERR_INVALID_PARAMS');
    await rejectsWith(sdk.storage.set('x', 'y'.repeat(33 * 1024)), 'ERR_INVALID_PARAMS');
    await rejectsWith(sdk.storage.set('big', 'y'.repeat(31 * 1024)).then(() => sdk.storage.set('big2', 'y'.repeat(31 * 1024)))
    .then(() => sdk.storage.set('big3', 'y'.repeat(31 * 1024))).then(() => sdk.storage.set('big4', 'y'.repeat(31 * 1024))),
    'ERR_QUOTA_EXCEEDED');
    assert.strictEqual(await sdk.storage.remove('missing'), undefined);
    assert.strictEqual(await sdk.storage.clear(), undefined);
    assert.deepStrictEqual(await sdk.storage.keys(), { keys: [] });
    assert.strictEqual((await sdk.storage.getInfo()).usedBytes, 0);
});

test('stub: storage treats "__proto__" and "constructor" as ordinary keys, before and after clear()', async () => {
    const sdk = load(makeWindow({ protocol: 'http:', hostname: 'localhost' }));
    for (const round of [0, 1]) {
        await sdk.storage.set('__proto__', round);
        await sdk.storage.set('__proto__', round + 10);
        assert.deepStrictEqual(await sdk.storage.get('__proto__'), { found: true, value: round + 10 });
        assert.deepStrictEqual(await sdk.storage.get('constructor'), { found: false });
        await sdk.storage.set('constructor', 'c');
        assert.deepStrictEqual(await sdk.storage.keys(), { keys: ['__proto__', 'constructor'] });
        const info = await sdk.storage.getInfo();
        assert.strictEqual(info.keyCount, 2);
        // Re-setting a key must replace, not accumulate: bytes for two small entries stay tiny.
        assert.ok(info.usedBytes < 64, `usedBytes=${info.usedBytes}`);
        await sdk.storage.remove('__proto__');
        assert.deepStrictEqual(await sdk.storage.get('__proto__'), { found: false });
        await sdk.storage.clear();
    }
});

// ---------------------------------------------------------------------------------------------

(async () => {
    let failures = 0;
    for (const [name, fn] of tests) {
        try {
            await fn();
            console.log(`ok   ${name}`);
        } catch (e) {
            failures += 1;
            console.log(`FAIL ${name}\n     ${e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n     ') : e}`);
        }
    }
    console.log(failures ? `\n${failures} of ${tests.length} failed` : `\nall ${tests.length} cases pass`);
    process.exitCode = failures ? 1 : 0;
})();
