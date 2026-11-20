// Copyright © 2026 Snap Inc.
// SPDX-License-Identifier: MIT
//
// Type-checks small consumer files against the built package under each way TypeScript can resolve it, so the
// declarations keep matching the ESM build's default and named exports and the window.snapchat global.
//
//   npm run build && node tests/types.js

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const tsc = require.resolve('typescript/bin/tsc');

const esm = `
import snapchat, { errors, snapchat as named, type AvatarInfo, type FriendAvatar, type Get2DAvatarParams, type Get3DAvatarParams, type StorageInfo, type SubscriptionStatus, type UpgradeOutcome, type HapticEvent } from '@snap/web-lens-api';
const version: string = snapchat.version;
const same: typeof snapchat = named;
const code: 'ERR_UNSUPPORTED_HOST' = errors.UNSUPPORTED_HOST;
const info: StorageInfo | undefined = undefined;
const portrait: Get2DAvatarParams = { size: 'small' };
const friendPortrait: Get2DAvatarParams = { avatar: 'h', size: 'small' };
const friends: Promise<{ avatars: FriendAvatar[] }> = snapchat.bitmoji.getFriendAvatars({ count: 3 });
const lowModel: Get3DAvatarParams = { avatar: 'h', meshQuality: 'low', textureQuality: 'medium' };
const lowModelCall = async () => snapchat.bitmoji.get3DAvatar(lowModel);
const friendModel = async (friend: FriendAvatar) => snapchat.bitmoji.get3DAvatar(friend);
const friendInfo: Promise<AvatarInfo> = snapchat.bitmoji.getAvatarInfo({ avatar: null });
const status: Promise<SubscriptionStatus> = snapchat.subscription.getStatus();
const upgrade: Promise<UpgradeOutcome> = snapchat.subscription.requestUpgrade();
const off: () => void = snapchat.subscription.onStatusChanged(({ eligible }) => console.log(eligible));
const tick: HapticEvent[] = [{ t: 0, type: 'tap' }, { t: 80, type: 'buzz', duration: 40, intensity: 0.5 }];
const played: Promise<void> = snapchat.haptics.pattern(tick);
const bump: Promise<void> = snapchat.haptics.impact('soft');
window.snapchat.init();
export { version, same, code, info, portrait, friendPortrait, friends, friendModel, friendInfo, status, upgrade, off, played, bump };
`;

const script = `
/// <reference types="@snap/web-lens-api" />
window.snapchat.init();
const storage: import('@snap/web-lens-api').StorageAPI = window.snapchat.storage;
const subscription: import('@snap/web-lens-api').SubscriptionAPI = window.snapchat.subscription;
export { storage, subscription };
`;

// [name, file, source, tsc options]
const CASES = [
    ['bundler (Vite, esbuild, webpack)', 'bundler.ts', esm, ['--module', 'esnext', '--moduleResolution', 'bundler']],
    ['nodenext, ESM importer', 'esm.mts', esm, ['--module', 'nodenext', '--moduleResolution', 'nodenext']],
    ['node10 (older bundler configs)', 'node10.ts', esm, ['--module', 'esnext', '--moduleResolution', 'node10']],
    ['classic <script>, window.snapchat', 'script.ts', script, ['--module', 'esnext', '--moduleResolution', 'bundler']]
];

// Install the built package the way npm would, so resolution goes through its package.json.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-lens-api-types-'));
const installed = path.join(dir, 'node_modules', '@snap', 'web-lens-api');
fs.mkdirSync(installed, { recursive: true });
fs.copyFileSync(path.join(root, 'package.json'), path.join(installed, 'package.json'));
fs.cpSync(path.join(root, 'dist'), path.join(installed, 'dist'), { recursive: true });

let failures = 0;
for (const [name, file, source, options] of CASES) {
    fs.writeFileSync(path.join(dir, file), source);
    try {
        execFileSync(process.execPath, [tsc, '--noEmit', '--strict', '--target', 'es2022', '--lib', 'es2022,dom', ...options, file], { cwd: dir, encoding: 'utf8' });
        console.log(`ok   ${name}`);
    } catch (e) {
        failures += 1;
        console.log(`FAIL ${name}\n     ${String(e.stdout || e.message).trim().split('\n').join('\n     ')}`);
    }
}
fs.rmSync(dir, { recursive: true, force: true });

console.log(failures ? `\n${failures} of ${CASES.length} failed` : `\nall ${CASES.length} cases pass`);
process.exit(failures ? 1 : 0);
