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
import { createPushHub } from './push';
import { createStub } from './stub';
import { getGlobal, selectTransport, type HostGlobal } from './transport';
import type { CapabilityMap, FriendAvatar, SnapchatWebLensAPI, StorageInfo, SubmitScoreResult, SubscriptionStatus, UpgradeOutcome } from './types';

export type * from './types';
export { errors };

const VERSION = '0.2.1';

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

// The hosts also send ineligibility_type with reason 'user_ineligible', which says why the user can't buy Lens+ in
// the app (a subscription managed elsewhere, say); that stays native, so only `subscribed` and `reason` cross.
function toUpgradeOutcome(reply: Record<string, unknown> | null): UpgradeOutcome {
    const outcome: UpgradeOutcome = { subscribed: reply?.subscribed === true };
    if (typeof reply?.reason === 'string') outcome.reason = reply.reason as UpgradeOutcome['reason'];
    return outcome;
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

// A media call's target: `avatar`, and the reserved `participant`, which the hosts reject.
const AVATAR_TARGET = ['avatar', 'participant'];

// The hosts call the middle 2D avatar size `normal`. get2DAvatar() sends `medium` to them under that name, and
// rejects their name like any other invalid size, so it doesn't linger as an alias. Null means reject.
function get2DAvatarWireParams(params: unknown): Record<string, unknown> | null {
    const { size, ...rest } = pickParams(params, [...AVATAR_TARGET, 'variant', 'size']);
    if (size === 'normal') return null;
    return size === undefined ? rest : { ...rest, size: size === 'medium' ? 'normal' : size };
}

// Hosts answer bare handle strings or `{ avatar }` objects; games always see objects.
function toFriendAvatars(reply: unknown): { avatars: FriendAvatar[] } {
    const list = reply && typeof reply === 'object' ? (reply as { avatars?: unknown }).avatars : undefined;
    const avatars: FriendAvatar[] = [];
    for (const entry of Array.isArray(list) ? list : []) {
        if (typeof entry === 'string') avatars.push({ avatar: entry });
        else if (entry && typeof entry === 'object' && typeof (entry as FriendAvatar).avatar === 'string') avatars.push({ ...(entry as FriendAvatar) });
    }
    return { avatars };
}

// A target is an object, or nothing for the user. A bare handle, or a non-string `avatar`, would otherwise read as
// "no target" and silently answer with the user.
function isValidTarget(params: unknown): boolean {
    if (params === undefined || params === null) return true;
    if (typeof params !== 'object' || Array.isArray(params)) return false;
    const avatar = (params as Record<string, unknown>).avatar;
    return avatar === undefined || avatar === null || typeof avatar === 'string';
}

// Only the named keys reach the hosts; absent keys stay absent.
function pickParams(params: unknown, keys: string[]): Record<string, unknown> {
    if (params === null || typeof params !== 'object' || Array.isArray(params)) return {};
    const out: Record<string, unknown> = {};
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(params, key)) out[key] = (params as Record<string, unknown>)[key];
    }
    return out;
}

function createApi(global: HostGlobal): SnapchatWebLensAPI {
    const push = createPushHub(global);
    const { transport, isStub } = selectTransport(global, () => createStub(push.simulate));

    let caps: CapabilityMap | null = null;
    let subscriptionObservingPrimed = false;

    function init(): Promise<CapabilityMap> {
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
    }

    // Friend calls depend on the host's bitmoji version, so before init() they are a Lens bug: reject, don't guess.
    function notInitialized<T>(call: string): Promise<T> | null {
        if (caps) return null;
        if (typeof console !== 'undefined') console.warn(`[snapchat] ${call} before init(): await snapchat.init() first`);
        return Promise.reject(bridgeError(errors.NOT_INITIALIZED));
    }

    function invalidTarget<T>(action: string): Promise<T> {
        if (typeof console !== 'undefined') console.warn(`[snapchat] bitmoji.${action}(): pass a friend entry from getFriendAvatars(), not its handle`);
        return Promise.reject(bridgeError(errors.INVALID_PARAMS));
    }

    // A v1 host ignores `avatar` and answers with the current user, so a friend's handle must not reach one.
    function avatarCall<T>(action: string, params: Record<string, unknown>): Promise<T> {
        if (params.avatar === undefined || params.avatar === null) return call<T>('bitmoji', action, params);
        const early = notInitialized<T>(`bitmoji.${action}({ avatar })`);
        if (early) return early;
        if ((caps?.bitmoji ?? 0) < 2) return Promise.reject(bridgeError(errors.INVALID_PARAMS));
        return call<T>('bitmoji', action, params);
    }

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

        init,

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

        subscription: {
            getStatus: () => call('subscription', 'getStatus', {}),
            requestUpgrade: () => call<Record<string, unknown> | null>('subscription', 'requestUpgrade', {}).then(toUpgradeOutcome),
            onStatusChanged(callback: (status: SubscriptionStatus) => void) {
                const unsubscribe = push.add('subscription', 'statusChanged', callback);
                // Native starts observing the entitlement on the first subscription call; make sure one happened.
                if (!subscriptionObservingPrimed && !isStub) {
                    subscriptionObservingPrimed = true;
                    call('subscription', 'getStatus', {}).catch(() => {
                        subscriptionObservingPrimed = false;
                    });
                }
                return unsubscribe;
            }
        },

        bitmoji: {
            getAvatarInfo: params => (isValidTarget(params) ?
                avatarCall('getAvatarInfo', pickParams(params, AVATAR_TARGET)) :
                invalidTarget('getAvatarInfo')),
            get2DAvatar: (params) => {
                if (!isValidTarget(params)) return invalidTarget('get2DAvatar');
                const wire = get2DAvatarWireParams(params);
                return wire ? avatarCall('get2DAvatar', wire) : Promise.reject(bridgeError(errors.INVALID_PARAMS));
            },
            get3DAvatar: params => (isValidTarget(params) ?
                avatarCall('get3DAvatar', pickParams(params, [...AVATAR_TARGET, 'meshQuality', 'textureQuality'])) :
                invalidTarget('get3DAvatar')),
            getVariants: () => call('bitmoji', 'getVariants', {}),
            // iOS reads only `count` here and ignores anything else, `participant` included.
            getFriendAvatars: params => notInitialized('bitmoji.getFriendAvatars()') ??
                call('bitmoji', 'getFriendAvatars', pickParams(params, ['count'])).then(toFriendAvatars)
        },

        storage: {
            get: key => call(WIRE_STORAGE, 'get', { key }),
            set: (key, value) => call(WIRE_STORAGE, 'set', { key, value }).then(nothing),
            remove: key => call(WIRE_STORAGE, 'remove', { key }).then(nothing),
            clear: () => call(WIRE_STORAGE, 'clear', {}).then(nothing),
            keys: () => call(WIRE_STORAGE, 'keys', {}),
            getInfo: () => call<Record<string, unknown> | null>(WIRE_STORAGE, 'getInfo', {}).then(toStorageInfo)
        },

        haptics: {
            impact: style => call('haptics', 'impact', style === undefined ? {} : { style }).then(nothing),
            pattern: events => call('haptics', 'pattern', { events }).then(nothing)
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
