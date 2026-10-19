// Copyright © 2026 Snap Inc.
// SPDX-License-Identifier: MIT
//
// Pins which transport `snap-api.js` picks per environment. The rule that matters: the desktop stub
// serves canned fixtures, so it must never engage inside a Lens host — a Lens on a host without the bridge
// has to report "no capabilities", not fake a working backend.
//
// Detection is by origin, which both hosts control: `weblens:` on iOS, a `web-lens.snap.local`
// subdomain on Android. So these cases are about origins, not user agents.
//
//   npm run build && node tests/transport-selection.js
//
// No framework on purpose: the API ships as one plain file games bundle, and this runs anywhere node does.

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'dist', 'snap-api.js'), 'utf8');

const UA = {
    ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
    android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36',
    desktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120'
};

function load({ ua, protocol, hostname = '', iosBridge = false, androidBridge = false }) {
    const win = {
        navigator: { userAgent: ua },
        location: { protocol, hostname },
        console: { info() {}, warn() {}, error() {} },
        addEventListener() {},
        dispatchEvent() {},
        setTimeout,
        clearTimeout
    };
    if (iosBridge) {
        win.webkit = { messageHandlers: { snapWebLensBridge: { postMessage: () => Promise.resolve({}) } } };
    }
    if (androidBridge) {
        win.snapWebLensBridge = { postMessage() {}, addEventListener() {} };
    }
    win.window = win;
    vm.createContext(win);
    vm.runInContext(src, win);
    return win.snapchat;
}

// [name, env, expectedIsStub]
const CASES = [
    // The origin is what decides, so each case states the one the host actually serves from.
    ['iOS in-app, bridge present', { ua: UA.ios, protocol: 'weblens:', hostname: 'lens', iosBridge: true }, false],
    ['iOS in-app, bridge absent', { ua: UA.ios, protocol: 'weblens:', hostname: 'lens' }, false],
    ['Android in-app, bridge present',
        { ua: UA.android, protocol: 'https:', hostname: 'wl0123456789abcdef0123456789abcdef.web-lens.snap.local', androidBridge: true },
        false],
    ['Android in-app, bridge absent',
        { ua: UA.android, protocol: 'https:', hostname: 'wl0123456789abcdef0123456789abcdef.web-lens.snap.local' },
        false],
    ['Lens host, unrecognised UA', { ua: '', protocol: 'weblens:', hostname: 'lens' }, false],
    // Not a Lens origin: a developer's browser, whatever the UA claims.
    ['iOS UA on some other https origin', { ua: UA.ios, protocol: 'https:', hostname: 'example.com' }, true],
    ['Android UA on some other https origin', { ua: UA.android, protocol: 'https:', hostname: 'example.com' }, true],
    ['desktop Chrome over http', { ua: UA.desktop, protocol: 'http:', hostname: 'localhost' }, true],
    ['desktop Chrome over file://', { ua: UA.desktop, protocol: 'file:', hostname: '' }, true],
    // Suffix match must not be fooled by a lookalike host.
    ['lookalike host', { ua: UA.desktop, protocol: 'https:', hostname: 'notweb-lens.snap.local.evil.com' }, true]
];

let failures = 0;
for (const [name, env, expected] of CASES) {
    const actual = load(env).isStub;
    const ok = actual === expected;
    if (!ok) {
        failures += 1;
    }
    console.log(`${ok ? 'ok  ' : 'FAIL'} isStub=${String(actual).padEnd(5)} expected=${String(expected).padEnd(5)} ${name}`);
}

// A device that falls back to the stub is the failure this file exists to catch.
console.log(failures ? `\n${failures} of ${CASES.length} failed` : `\nall ${CASES.length} cases pass`);
process.exit(failures ? 1 : 0);
