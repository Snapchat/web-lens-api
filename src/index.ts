// Copyright © 2026 Snap Inc.
// SPDX-License-Identifier: MIT

/**
 * Snapchat Web Lens API (`window.snapchat`) — one include for iOS, Android, and desktop development.
 *
 * Put the built file in your game's zip (the one you upload to My Lenses, with `index.html` at its root):
 * the Lens CSP blocks runtime fetches by design.
 *
 * ```js
 * await snapchat.init();
 * if (snapchat.isSupported('leaderboards')) {
 *     await snapchat.leaderboards.submitScore({ score: 42 });
 *     await snapchat.leaderboards.show();
 * }
 * ```
 *
 * @packageDocumentation
 */

import { bridgeError, errors } from './errors';
import { createStub } from './stub';
import { getGlobal, selectTransport, type HostGlobal } from './transport';
import type { CapabilityMap, SnapchatWebLensAPI, StorageInfo, SubmitScoreResult } from './types';

export type * from './types';
export { errors };

const VERSION = '0.1.3';

// The hosts serve storage as `games_storage`; the API names it `storage`, after its namespace. Every other
// capability has the same name on both sides.
const WIRE_STORAGE = 'games_storage';
const API_NAMES = new Map([[WIRE_STORAGE, 'storage']]);

// A failure always rejects, so success needs no `ok: true`, and the score echoed back is the caller's own. What
// remains is the player's best, which the hosts call `newScore`.
function toSubmitScoreResult(reply: Record<string, unknown> | null): SubmitScoreResult {
    const best = reply?.newScore;
    return typeof best === 'number' ? { bestScore: best } : {};
}

// The hosts name the storage limits bytesUsed, byteLimit, keyLimit and valueLimit, and call in-memory persistence
// `inMemory`; the API puts the unit in each limit's name and says `memory`, to match `disk`.
function toStorageInfo(reply: Record<string, unknown> | null): StorageInfo {
    const info = reply ?? {};
    return {
        usedBytes: info.bytesUsed,
        maxBytes: info.byteLimit,
        keyCount: info.keyCount,
        maxKeys: info.keyLimit,
        maxValueBytes: info.valueLimit,
        persistenceMode: info.persistenceMode === 'inMemory' ? 'memory' : info.persistenceMode
    } as StorageInfo;
}

// The iOS and Android hosts still reject a submission without a board id, which the API no longer asks for.
const PLACEHOLDER_BOARD_ID = 'main';

// present() and the storage writes resolve with nothing: the hosts' reply only confirms success.
const nothing = (): void => undefined;

// The hosts call the middle 2D avatar size `normal`. get2DAvatar() sends `medium` to them under that name, and
// rejects their name like any other invalid size, so it doesn't linger as an alias. Null means reject.
function get2DAvatarWireParams(params: unknown): Record<string, unknown> | null {
    if (params === null || typeof params !== 'object' || Array.isArray(params)) return {};
    const { size, ...rest } = params as Record<string, unknown>;
    if (size === 'normal') return null;
    return size === undefined ? rest : { ...rest, size: size === 'medium' ? 'normal' : size };
}

function createApi(global: HostGlobal): SnapchatWebLensAPI {
    const { transport, isStub } = selectTransport(global, createStub);

    let caps: CapabilityMap | null = null;

    function call<T>(capability: string, action: string, params?: unknown): Promise<T> {
        const p = params !== null && typeof params === 'object' && !Array.isArray(params) ? (params as Record<string, unknown>) : {};
        return transport({ uri: `app://${capability}/${action}`, params: p }) as Promise<T>;
    }

    const api: SnapchatWebLensAPI = {
        version: VERSION,
        errors,
        get isStub() {
            return isStub;
        },

        init() {
            return call<{ capabilities?: unknown } | null>('sdk', 'getCapabilities')
            .then((reply) => {
                const discovered = reply && typeof reply === 'object' ? reply.capabilities : undefined;
                const next: CapabilityMap = {};
                if (discovered && typeof discovered === 'object') {
                    for (const name of Object.keys(discovered)) {
                        const version = (discovered as Record<string, unknown>)[name];
                        if (typeof version === 'number') next[API_NAMES.get(name) ?? name] = version;
                    }
                }
                caps = next;
                return caps;
            })
            .catch((e: unknown) => {
                const code = e && typeof (e as Error).message === 'string' ? (e as Error).message : '';
                if (code === errors.UNSUPPORTED_HOST || code === errors.UNKNOWN_CAPABILITY) {
                    caps = {};
                    return caps;
                }
                throw e;
            });
        },

        isSupported(capability, minVersion) {
            if (!caps || !Object.prototype.hasOwnProperty.call(caps, capability)) return false;
            const required = typeof minVersion === 'number' && minVersion >= 1 ? minVersion : 1;
            return caps[capability] >= required;
        },

        leaderboards: {
            submitScore: params => call<Record<string, unknown> | null>('leaderboards', 'submitScore', {
                ...params,
                leaderboardId: params?.leaderboardId || PLACEHOLDER_BOARD_ID
            }).then(toSubmitScoreResult),
            // The hosts call this action `present`.
            show: () => call('leaderboards', 'present', {}).then(nothing)
        },

        bitmoji: {
            getAvatarInfo: () => call('bitmoji', 'getAvatarInfo', {}),
            get2DAvatar: (params) => {
                const wire = get2DAvatarWireParams(params);
                return wire ? call('bitmoji', 'get2DAvatar', wire) : Promise.reject(bridgeError(errors.INVALID_PARAMS));
            },
            get3DAvatar: () => call('bitmoji', 'get3DAvatar', {}),
            getVariants: () => call('bitmoji', 'getVariants', {})
        },

        storage: {
            get: key => call(WIRE_STORAGE, 'get', { key }),
            set: (key, value) => call(WIRE_STORAGE, 'set', { key, value }).then(nothing),
            remove: key => call(WIRE_STORAGE, 'remove', { key }).then(nothing),
            clear: () => call(WIRE_STORAGE, 'clear', {}).then(nothing),
            keys: () => call(WIRE_STORAGE, 'keys', {}),
            getInfo: () => call<Record<string, unknown> | null>(WIRE_STORAGE, 'getInfo', {}).then(toStorageInfo)
        }
    };

    Object.defineProperty(api, '__isSnapchatWebLensAPI', { value: true });
    return api;
}

function installed(global: HostGlobal): SnapchatWebLensAPI | undefined {
    const candidate = global.snapchat as { __isSnapchatWebLensAPI?: boolean } | undefined;
    return candidate && candidate.__isSnapchatWebLensAPI === true ? (candidate as SnapchatWebLensAPI) : undefined;
}

const host = getGlobal();
// Re-including the script (two <script> tags, two bundled copies) must not create a second
// instance: on Android both copies would share one reply channel and settle each other's calls.
const existing = installed(host);

/**
 * The singleton also installed as `window.snapchat`.
 *
 * @example
 * ```js
 * // With a bundler or native ES modules:
 * import snapchat from '@snap/web-lens-api';
 *
 * // With a classic <script src="snap-api.js"> include, use window.snapchat directly.
 * ```
 */
export const snapchat: SnapchatWebLensAPI = existing || createApi(host);

if (!existing) {
    host.snapchat = snapchat;
    // Deprecated alias: pre-rename Lenses and the Lens submission scanner still address `SnapSDK`.
    if (!host.SnapSDK) host.SnapSDK = snapchat;
}

export default snapchat;

declare global {
    interface Window {
        snapchat: SnapchatWebLensAPI;
        /** @deprecated pre-rename alias of `snapchat`; kept for Lenses built against the SDK-era global. */
        SnapSDK: SnapchatWebLensAPI;
    }
}
