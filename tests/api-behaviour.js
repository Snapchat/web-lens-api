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
        },
        MessageEvent
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

test('Android: requestUpgrade() resolves the host\'s { subscribed } as is', async () => {
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
    const sdk = load(win);
    const reply = (payload) => {
        const { requestId } = sent[sent.length - 1];
        listeners.forEach(fn => fn({ data: JSON.stringify({ requestId, ok: true, payload }) }));
    };
    const init = sdk.init();
    reply({ capabilities: { subscription: 1 } });
    assert.deepStrictEqual(await init, { subscription: 1 });
    const upgrade = sdk.subscription.requestUpgrade();
    assert.deepStrictEqual(sent[sent.length - 1], { requestId: sent[sent.length - 1].requestId, uri: 'app://subscription/requestUpgrade', params: {} });
    reply({ subscribed: false });
    assert.deepStrictEqual(await upgrade, { subscribed: false });
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

test('iOS: onStatusChanged primes native observation with one getStatus call', async () => {
    const win = makeWindow({ protocol: 'weblens:', hostname: 'lens' });
    const uris = [];
    const bridge = {
        postMessage(m) {
            uris.push(m.uri);
            return Promise.resolve(m.uri.endsWith('getCapabilities') ? { capabilities: { subscription: 1 } } : { eligible: false });
        }
    };
    win.webkit = { messageHandlers: { snapWebLensBridge: bridge } };
    const sdk = load(win);
    await sdk.init();
    sdk.subscription.onStatusChanged(() => {});
    sdk.subscription.onStatusChanged(() => {});
    assert.deepStrictEqual(uris, ['app://sdk/getCapabilities', 'app://subscription/getStatus']);
});

test('iOS: onStatusChanged primes native observation even before init() resolves', () => {
    const win = makeWindow({ protocol: 'weblens:', hostname: 'lens' });
    const uris = [];
    const bridge = {
        postMessage(m) {
            uris.push(m.uri);
            return Promise.resolve({ eligible: false });
        }
    };
    win.webkit = { messageHandlers: { snapWebLensBridge: bridge } };
    load(win).subscription.onStatusChanged(() => {});
    assert.deepStrictEqual(uris, ['app://subscription/getStatus']);
});

test('iOS: a throttled requestUpgrade() resolves { subscribed: false, reason }', async () => {
    const win = makeWindow({ protocol: 'weblens:', hostname: 'lens' });
    const bridge = {
        postMessage() {
            return Promise.resolve({ subscribed: false, reason: 'too_soon' });
        }
    };
    win.webkit = { messageHandlers: { snapWebLensBridge: bridge } };
    assert.deepStrictEqual(await load(win).subscription.requestUpgrade(), { subscribed: false, reason: 'too_soon' });
});

test('requestUpgrade() keeps the host\'s reason, and drops ineligibility_type', async () => {
    const win = makeWindow({ protocol: 'weblens:', hostname: 'lens' });
    const bridge = {
        postMessage() {
            return Promise.resolve({ subscribed: false, reason: 'user_ineligible', ineligibility_type: 'gifted' });
        }
    };
    win.webkit = { messageHandlers: { snapWebLensBridge: bridge } };
    assert.deepStrictEqual(await load(win).subscription.requestUpgrade(), { subscribed: false, reason: 'user_ineligible' });
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

function iosHost(capabilities, reply = () => ({ url: 'blob:x' })) {
    const win = makeWindow({ protocol: 'weblens:', hostname: 'lens' });
    const sent = [];
    win.webkit = { messageHandlers: { snapWebLensBridge: { postMessage(m) {
        sent.push(m);
        return Promise.resolve(m.uri === 'app://sdk/getCapabilities' ? { capabilities } : reply(m));
    } } } };
    return { sdk: load(win), sent: () => sent.filter(m => m.uri !== 'app://sdk/getCapabilities') };
}

test('get3DAvatar sends meshQuality and textureQuality with the target, and nothing else', async () => {
    const { sdk, sent } = iosHost({ bitmoji: 2 }, () => ({ url: 'blob:x' }));
    await sdk.init();
    await sdk.bitmoji.get3DAvatar({ avatar: 'h1', meshQuality: 'low', textureQuality: 'medium', extra: 1 });
    await sdk.bitmoji.get3DAvatar({ meshQuality: 'high' });
    assert.deepStrictEqual(sent().map(m => [m.uri, m.params]), [
        ['app://bitmoji/get3DAvatar', { avatar: 'h1', meshQuality: 'low', textureQuality: 'medium' }],
        ['app://bitmoji/get3DAvatar', { meshQuality: 'high' }]
    ]);
});

test('iOS: friend avatars send only count, and pass the handle as avatar, and only avatar, to every media call', async () => {
    const { sdk, sent } = iosHost({ bitmoji: 2 }, m => (m.uri === 'app://bitmoji/getFriendAvatars' ? { avatars: [{ avatar: 'h1' }] } : { url: 'blob:x' }));
    await sdk.init();
    assert.deepStrictEqual(await sdk.bitmoji.getFriendAvatars({ count: 3, participant: 'p1', avatar: 'h1' }), { avatars: [{ avatar: 'h1' }] });
    await sdk.bitmoji.get3DAvatar({ avatar: 'h1', extra: 1 });
    await sdk.bitmoji.get2DAvatar({ avatar: 'h1', size: 'medium', extra: 1 });
    await sdk.bitmoji.getAvatarInfo({ avatar: null });
    await sdk.bitmoji.get3DAvatar();
    assert.deepStrictEqual(sent().map(m => [m.uri, m.params]), [
        ['app://bitmoji/getFriendAvatars', { count: 3 }],
        ['app://bitmoji/get3DAvatar', { avatar: 'h1' }],
        ['app://bitmoji/get2DAvatar', { avatar: 'h1', size: 'normal' }],
        ['app://bitmoji/getAvatarInfo', { avatar: null }],
        ['app://bitmoji/get3DAvatar', {}]
    ]);
});

test('iOS: a bare-string friend list arrives as { avatar } objects, extra fields kept', async () => {
    const { sdk } = iosHost({ bitmoji: 2 }, () => ({ avatars: ['h1', { avatar: 'h2', future: true }, 42, null, { nope: 1 }] }));
    await sdk.init();
    assert.deepStrictEqual(await sdk.bitmoji.getFriendAvatars({ count: 3 }), { avatars: [{ avatar: 'h1' }, { avatar: 'h2', future: true }] });
});

test('iOS: a friend entry passes straight back as the target, and only its avatar reaches the host', async () => {
    const { sdk, sent } = iosHost({ bitmoji: 2 });
    await sdk.init();
    const friend = { avatar: 'h1', future: true };
    await sdk.bitmoji.get3DAvatar(friend);
    await sdk.bitmoji.get2DAvatar({ ...friend, size: 'small' });
    assert.deepStrictEqual(sent().map(m => m.params), [{ avatar: 'h1' }, { avatar: 'h1', size: 'small' }]);
});

test('iOS: a bare handle, a non-object target or a non-string avatar rejects before reaching the host', async () => {
    const { sdk, sent } = iosHost({ bitmoji: 2 });
    await sdk.init();
    for (const target of ['h1', 42, true, ['h1'], { avatar: { avatar: 'h1' } }, { avatar: 7 }]) {
        await rejectsWith(sdk.bitmoji.get3DAvatar(target), 'ERR_INVALID_PARAMS');
        await rejectsWith(sdk.bitmoji.get2DAvatar(target), 'ERR_INVALID_PARAMS');
        await rejectsWith(sdk.bitmoji.getAvatarInfo(target), 'ERR_INVALID_PARAMS');
    }
    assert.deepStrictEqual(sent(), [], 'nothing is sent, so a slip never answers with the user');
    await sdk.bitmoji.get3DAvatar();
    await sdk.bitmoji.get3DAvatar(null);
    await sdk.bitmoji.get2DAvatar({ size: 'small' });
    assert.deepStrictEqual(sent().map(m => m.params), [{}, {}, { size: 'small' }], 'no target still means the user');
});

test('iOS: a friend handle never reaches a bitmoji v1 host, which would answer with the current user', async () => {
    const { sdk, sent } = iosHost({ bitmoji: 1 });
    await sdk.init();
    await rejectsWith(sdk.bitmoji.get3DAvatar({ avatar: 'h1' }), 'ERR_INVALID_PARAMS');
    await rejectsWith(sdk.bitmoji.get2DAvatar({ avatar: 'h1' }), 'ERR_INVALID_PARAMS');
    await rejectsWith(sdk.bitmoji.getAvatarInfo({ avatar: 'h1' }), 'ERR_INVALID_PARAMS');
    await sdk.bitmoji.get3DAvatar({ avatar: null });
    assert.deepStrictEqual(sent().map(m => m.params), [{ avatar: null }]);
});

test('iOS: a friend handle sent before init() rejects ERR_NOT_INITIALIZED and reaches no host, whatever its bitmoji version', async () => {
    for (const bitmoji of [1, 2]) {
        const { sdk, sent } = iosHost({ bitmoji });
        await rejectsWith(sdk.bitmoji.get3DAvatar({ avatar: 'h1' }), 'ERR_NOT_INITIALIZED');
        await rejectsWith(sdk.bitmoji.get2DAvatar({ avatar: 'h1', size: 'small' }), 'ERR_NOT_INITIALIZED');
        await rejectsWith(sdk.bitmoji.getAvatarInfo({ avatar: 'h1' }), 'ERR_NOT_INITIALIZED');
        await rejectsWith(sdk.bitmoji.getFriendAvatars({ count: 3 }), 'ERR_NOT_INITIALIZED');
        assert.deepStrictEqual(sent(), [], 'nothing is sent, and init() is not called behind the Lens\'s back');
        assert.strictEqual(sdk.isSupported('bitmoji'), false);
    }
});

test('iOS: before init() every call but the friend ones still reaches the host', async () => {
    const { sdk, sent } = iosHost({ bitmoji: 1, leaderboards: 1, subscription: 1, games_storage: 1 }, () => ({}));
    await sdk.bitmoji.getAvatarInfo();
    await sdk.bitmoji.get2DAvatar({ size: 'small' });
    await sdk.bitmoji.get3DAvatar({ avatar: null });
    await sdk.bitmoji.getVariants();
    await sdk.leaderboards.submitScore({ score: 1 });
    await sdk.leaderboards.show();
    await sdk.subscription.getStatus();
    await sdk.storage.get('save');
    assert.deepStrictEqual(sent().map(m => m.uri), [
        'app://bitmoji/getAvatarInfo', 'app://bitmoji/get2DAvatar', 'app://bitmoji/get3DAvatar', 'app://bitmoji/getVariants',
        'app://leaderboards/submitScore', 'app://leaderboards/present', 'app://subscription/getStatus', 'app://games_storage/get'
    ]);
});

test('stub: a bare handle as the target rejects on the desktop too', async () => {
    const sdk = load(makeWindow({ protocol: 'http:', hostname: 'localhost' }));
    await sdk.init();
    const { avatars } = await sdk.bitmoji.getFriendAvatars({ count: 1 });
    await rejectsWith(sdk.bitmoji.get3DAvatar(avatars[0].avatar), 'ERR_INVALID_PARAMS');
    assert.ok((await sdk.bitmoji.get3DAvatar(avatars[0])).url.startsWith('data:model/gltf-binary'));
});

test('stub: a friend handle before init() rejects there too, so the missing init() shows up on the desktop', async () => {
    const sdk = load(makeWindow({ protocol: 'http:', hostname: 'localhost' }));
    await rejectsWith(sdk.bitmoji.get3DAvatar({ avatar: 'stub-friend-1' }), 'ERR_NOT_INITIALIZED');
    await rejectsWith(sdk.bitmoji.getFriendAvatars({ count: 1 }), 'ERR_NOT_INITIALIZED');
    await sdk.init();
    assert.ok((await sdk.bitmoji.get3DAvatar({ avatar: 'stub-friend-1' })).url.startsWith('data:model/gltf-binary'));
});

test('Lens host without a bridge: init() resolves {} and calls reject ERR_UNSUPPORTED_HOST', async () => {
    const sdk = load(makeWindow({ protocol: 'weblens:', hostname: 'lens' }));
    assert.strictEqual(sdk.isStub, false);
    assert.deepStrictEqual(await sdk.init(), {});
    await rejectsWith(sdk.bitmoji.getAvatarInfo(), 'ERR_UNSUPPORTED_HOST');
    await rejectsWith(sdk.subscription.getStatus(), 'ERR_UNSUPPORTED_HOST');
});

// What the iOS host dispatches for subscription's statusChanged.
function statusChanged(win, payload) {
    win.dispatchEvent(new win.MessageEvent('snapWebLensPush', { data: { capability: 'subscription', event: 'statusChanged', json: JSON.stringify(payload) } }));
}

test('onStatusChanged: a throwing listener does not starve the others; unsubscribe is one-shot', () => {
    const win = makeWindow({ protocol: 'http:', hostname: 'localhost' });
    const sdk = load(win);
    const seen = [];
    const off = sdk.subscription.onStatusChanged(() => {
        throw new Error('boom');
    });
    sdk.subscription.onStatusChanged(s => seen.push(s.eligible));
    statusChanged(win, { eligible: true });
    assert.deepStrictEqual(seen, [true]);
    off();
    off();
    statusChanged(win, { eligible: false });
    assert.deepStrictEqual(seen, [true, false]);
    assert.throws(() => sdk.subscription.onStatusChanged('not a function'), TypeError);
});

test('onStatusChanged: malformed or unaddressed host events are ignored', () => {
    const win = makeWindow({ protocol: 'http:', hostname: 'localhost' });
    const sdk = load(win);
    const seen = [];
    sdk.subscription.onStatusChanged(s => seen.push(s));
    win.dispatchEvent(new win.MessageEvent('snapWebLensPush', { data: { capability: 'subscription', event: 'statusChanged', json: '{not json' } }));
    win.dispatchEvent(new win.MessageEvent('snapWebLensPush', { data: { capability: 'other', event: 'statusChanged', json: '{}' } }));
    win.dispatchEvent(new win.MessageEvent('snapWebLensPush', { data: null }));
    assert.deepStrictEqual(seen, []);
});

test('global: window.snapchat is the API and window.SnapSDK is a deprecated alias of the same object', () => {
    const win = makeWindow({ protocol: 'http:', hostname: 'localhost' });
    const api = load(win);
    assert.strictEqual(win.snapchat, api);
    assert.strictEqual(win.SnapSDK, api);
    assert.strictEqual(api.version, '0.2.0');
});

test('global: the API adds only the subscription and haptics namespaces to 0.1.2, and no push surface', () => {
    const api = load(makeWindow({ protocol: 'http:', hostname: 'localhost' }));
    assert.deepStrictEqual(Object.keys(api), ['version', 'errors', 'isStub', 'init', 'isSupported', 'leaderboards', 'subscription', 'bitmoji', 'storage', 'haptics']);
    assert.deepStrictEqual(Object.keys(api.subscription), ['getStatus', 'requestUpgrade', 'onStatusChanged']);
    assert.ok(!('isPushSupported' in api) && !('__simulatePush' in api));
});

test('stub: errors are frozen and every code is exposed', () => {
    const sdk = load(makeWindow({ protocol: 'http:', hostname: 'localhost' }));
    assert.ok(Object.isFrozen(sdk.errors));
    assert.deepStrictEqual(Object.keys(sdk.errors).sort(), [
        'INTERNAL', 'INVALID_PARAMS', 'MALFORMED_REQUEST', 'NOT_INITIALIZED', 'QUOTA_EXCEEDED', 'STORAGE_UNAVAILABLE', 'UNKNOWN_CAPABILITY', 'UNSUPPORTED_HOST'
    ]);
});

test('stub: leaderboards validate like native and echo the submitted score', async () => {
    const sdk = load(makeWindow({ protocol: 'http:', hostname: 'localhost' }));
    assert.deepStrictEqual(await sdk.init(), { leaderboards: 1, subscription: 1, bitmoji: 2, storage: 1, haptics: 1 });
    const r = await sdk.leaderboards.submitScore({ score: 42, ordering: 'ascending' });
    assert.deepStrictEqual(r, { bestScore: 42 });
    await rejectsWith(sdk.leaderboards.submitScore({}), 'ERR_INVALID_PARAMS');
    await rejectsWith(sdk.leaderboards.submitScore({ score: 1.5 }), 'ERR_INVALID_PARAMS');
    await rejectsWith(sdk.leaderboards.submitScore({ score: 1, ordering: 'up' }), 'ERR_INVALID_PARAMS');
    assert.strictEqual(await sdk.leaderboards.show(), undefined);
});

test('stub: subscription flips once and fires onStatusChanged only on the change', async () => {
    const sdk = load(makeWindow({ protocol: 'http:', hostname: 'localhost' }));
    const pushes = [];
    sdk.subscription.onStatusChanged(s => pushes.push(s.eligible));
    assert.deepStrictEqual(await sdk.subscription.getStatus(), { eligible: false });
    assert.deepStrictEqual(await sdk.subscription.requestUpgrade(), { subscribed: true });
    assert.deepStrictEqual(await sdk.subscription.requestUpgrade(), { subscribed: true });
    assert.deepStrictEqual(await sdk.subscription.getStatus(), { eligible: true });
    assert.deepStrictEqual(pushes, [true]);
});

test('stub: concurrent requestUpgrade() calls fire onStatusChanged once', async () => {
    const sdk = load(makeWindow({ protocol: 'http:', hostname: 'localhost' }));
    const pushes = [];
    sdk.subscription.onStatusChanged(s => pushes.push(s.eligible));
    const outcomes = await Promise.all([sdk.subscription.requestUpgrade(), sdk.subscription.requestUpgrade()]);
    assert.deepStrictEqual(outcomes, [{ subscribed: true }, { subscribed: true }]);
    assert.deepStrictEqual(pushes, [true]);
});

test('stub: get3DAvatar validates meshQuality and textureQuality', async () => {
    const sdk = load(makeWindow({ protocol: 'http:', hostname: 'localhost' }));
    for (const bad of [{ meshQuality: 'normal' }, { textureQuality: 123 }, { meshQuality: '' }]) {
        await rejectsWith(sdk.bitmoji.get3DAvatar(bad), 'ERR_INVALID_PARAMS');
    }
    for (const ok of [{}, { meshQuality: null }, { meshQuality: 'low', textureQuality: 'medium' }, { textureQuality: 'high' }]) {
        assert.ok((await sdk.bitmoji.get3DAvatar(ok)).url);
    }
});

test('stub: bitmoji rejects participant on media calls, validates variant/size, never serves an empty url', async () => {
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
    await rejectsWith(sdk.bitmoji.get3DAvatar({ participant: 'p1' }), 'ERR_INVALID_PARAMS');
    await rejectsWith(sdk.bitmoji.getAvatarInfo({ participant: 'p1' }), 'ERR_INVALID_PARAMS');
    // Like iOS, getFriendAvatars reads only count (after init(), which friend calls require).
    await sdk.init();
    assert.deepStrictEqual(await sdk.bitmoji.getFriendAvatars({ count: 2, participant: 'p1' }), { avatars: [{ avatar: 'stub-friend-1' }, { avatar: 'stub-friend-2' }] });
});

test('stub: bitmoji v2 serves fixed friend handles that resolve as avatar, and validates count and handles', async () => {
    const sdk = load(makeWindow({ protocol: 'http:', hostname: 'localhost' }));
    await sdk.init();
    assert.ok(sdk.isSupported('bitmoji', 2));
    assert.deepStrictEqual(await sdk.bitmoji.getAvatarInfo(), { hasAvatar: true, maxBatchCount: 20 });
    const { avatars } = await sdk.bitmoji.getFriendAvatars({ count: 2 });
    assert.strictEqual(avatars.length, 2);
    assert.deepStrictEqual((await sdk.bitmoji.getFriendAvatars({ count: 2 })).avatars, avatars, 'same list every call');
    assert.strictEqual((await sdk.bitmoji.getFriendAvatars({ count: 50 })).avatars.length, 3, 'never padded');
    assert.deepStrictEqual(await sdk.bitmoji.getAvatarInfo(avatars[0]), { hasAvatar: true, maxBatchCount: 20 });
    assert.ok((await sdk.bitmoji.get2DAvatar({ ...avatars[0], size: 'small' })).url.startsWith('data:image/png'));
    assert.ok((await sdk.bitmoji.get3DAvatar(avatars[1])).url.startsWith('data:model/gltf-binary'));
    for (const count of [0, -1, 1.5, '2', undefined]) await rejectsWith(sdk.bitmoji.getFriendAvatars({ count }), 'ERR_INVALID_PARAMS');
    await rejectsWith(sdk.bitmoji.get3DAvatar({ avatar: 'not-a-handle' }), 'ERR_INVALID_PARAMS');
});

test('iOS: haptics sends impact and pattern params as given, and an absent style as no params', async () => {
    const win = makeWindow({ protocol: 'weblens:', hostname: 'lens' });
    const log = [];
    win.webkit = { messageHandlers: { snapWebLensBridge: { postMessage(m) {
        log.push(m);
        return Promise.resolve(m.uri === 'app://sdk/getCapabilities' ? { capabilities: { haptics: 1 } } : { played: true });
    } } } };
    const sdk = load(win);
    const sent = () => log.filter(m => m.uri !== 'app://sdk/getCapabilities');
    await sdk.init();
    assert.ok(sdk.isSupported('haptics'));
    assert.strictEqual(await sdk.haptics.impact(), undefined, 'the host reply is not passed on');
    await sdk.haptics.impact('heavy');
    await sdk.haptics.pattern([{ t: 0, type: 'tap' }, { t: 100, type: 'buzz', duration: 200, intensity: 0.5 }]);
    assert.deepStrictEqual(sent().map(m => [m.uri, m.params]), [
        ['app://haptics/impact', {}],
        ['app://haptics/impact', { style: 'heavy' }],
        ['app://haptics/pattern', { events: [{ t: 0, type: 'tap' }, { t: 100, type: 'buzz', duration: 200, intensity: 0.5 }] }]
    ]);
});

test('stub: haptics validates like native and resolves with nothing', async () => {
    const sdk = load(makeWindow({ protocol: 'http:', hostname: 'localhost' }));
    assert.strictEqual((await sdk.init()).haptics, 1);
    assert.strictEqual(await sdk.haptics.impact(), undefined);
    assert.strictEqual(await sdk.haptics.impact('light'), undefined);
    assert.strictEqual(await sdk.haptics.pattern([{ t: 0, type: 'buzz', duration: 120 }]), undefined);
    const invalid = [
        ['rigid'],
        [[]],
        [Array.from({ length: 17 }, (_, i) => ({ t: i * 10, type: 'tap' }))],
        [[{ t: 0, type: 'tap', duration: 10 }]],
        [[{ t: 0, type: 'buzz' }]],
        [[{ t: 0, type: 'buzz', duration: 501 }]],
        [[{ t: 0, type: 'buzz', duration: 100 }, { t: 50, type: 'tap' }]],
        [[{ t: 10, type: 'tap' }, { t: 10, type: 'tap' }]],
        [[{ t: 0.5, type: 'tap' }]],
        [[{ t: 0, type: 'tap', intensity: 2 }]],
        [[{ t: 0, type: 'pulse' }]],
        [[{ t: 900, type: 'buzz', duration: 200 }]]
    ];
    for (const [arg] of invalid) {
        const call = typeof arg === 'string' ? sdk.haptics.impact(arg) : sdk.haptics.pattern(arg);
        await rejectsWith(call, 'ERR_INVALID_PARAMS');
    }
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
