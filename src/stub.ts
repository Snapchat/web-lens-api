// Copyright © 2026 Snap Inc.
// SPDX-License-Identifier: MIT
//
// Desktop stub. Mirrors native validation and reply shapes so a game that works against it also
// works on a device: the same ERR_* codes for the same bad inputs, the same payload fields.

import { bridgeError, errors } from './errors';
import type { BridgeMessage, Transport } from './transport';

type Params = Record<string, unknown>;
type Handler = (action: string, params: Params) => Promise<unknown>;

const STUB_VARIANTS = ['10226807', '20061402', '31151407', '30060626'];
// Handles are opaque on a device; the stub's are readable so console traces stay legible. Its friends wear the
// same placeholder media as the user, so a game shows them with its bundled default avatar.
const STUB_FRIENDS = ['stub-friend-1', 'stub-friend-2', 'stub-friend-3'];
const STUB_MAX_BATCH_COUNT = 20;
// 1x1 transparent PNG: a valid `url` for <img> and fetch(), so stub code needs no branch.
const PNG_URL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ' +
  'AAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
// Minimal glTF 2.0 binary whose one scene holds one empty node (no meshes): loads in PlayCanvas and
// other GLB loaders. PlayCanvas rejects a GLB with only an asset header, or with an empty scene.
const GLB_URL =
    'data:model/gltf-binary;base64,Z2xURgIAAABgAAAATAAAAEpTT057ImFzc2V0Ijp7InZlcnNpb24iOiIyLjAifSwic2Nl' +
    'bmUiOjAsInNjZW5lcyI6W3sibm9kZXMiOlswXX1dLCJub2RlcyI6W3t9XX0g';
const IMPACT_STYLES = ['light', 'medium', 'heavy', 'soft'];
const HAPTICS_LIMITS = { maxEvents: 16, maxPatternMs: 1000, maxBuzzMs: 500 };
const STORAGE_LIMITS = { byteLimit: 100 * 1024, keyLimit: 256, valueLimit: 32 * 1024, keyLengthLimit: 256 };

const ok = (value: unknown) => Promise.resolve(value);
const fail = (code: string) => Promise.reject(bridgeError(code));
const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isObject = (v: unknown): v is Params => v !== null && typeof v === 'object' && !Array.isArray(v);
const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function utf8Length(s: string): number {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
    return encodeURIComponent(s).replace(/%[0-9A-F]{2}/g, 'x').length;
}
const jsonBytes = (v: unknown) => utf8Length(JSON.stringify(v));
const isValidKey = (k: unknown): k is string => isNonEmptyString(k) && utf8Length(k) <= STORAGE_LIMITS.keyLengthLimit;

function hasExactly(params: Params, keys: string[]): boolean {
    const own = Object.keys(params);
    return own.length === keys.length && keys.every(k => hasOwn(params, k));
}

const isIntensity = (v: unknown) => v === undefined || (typeof v === 'number' && v >= 0 && v <= 1);
const hasOnly = (o: Params, keys: string[]) => Object.keys(o).every(k => keys.indexOf(k) !== -1);

// The pattern's length in ms, or null when the hosts would reject it.
function patternLength(events: unknown): number | null {
    if (!Array.isArray(events) || events.length < 1 || events.length > HAPTICS_LIMITS.maxEvents) return null;
    let lastT = -1;
    let end = 0;
    for (const e of events) {
        if (!isObject(e) || !Number.isInteger(e.t) || (e.t as number) < 0 || !isIntensity(e.intensity)) return null;
        const t = e.t as number;
        let duration = 0;
        if (e.type === 'tap') {
            if (!hasOnly(e, ['t', 'type', 'intensity'])) return null;
        } else if (e.type === 'buzz') {
            const d = e.duration;
            if (!hasOnly(e, ['t', 'type', 'intensity', 'duration']) || !Number.isInteger(d) || (d as number) < 1 || (d as number) > HAPTICS_LIMITS.maxBuzzMs) return null;
            duration = d as number;
        } else {
            return null;
        }
        if (t <= lastT || t < end) return null;
        lastT = t;
        end = t + duration;
    }
    return end <= HAPTICS_LIMITS.maxPatternMs ? end : null;
}

export function createStub(simulatePush: (capability: string, event: string, payload: unknown) => void): Transport {
    let lensPlus = false;
    // A Map so "__proto__" behaves like any other key, as it does in the native store.
    let store = new Map<string, string>();
    let storeBytes = 0;

    const leaderboards: Handler = (action, p) => {
        if (action === 'submitScore') {
            const orderingOk = p.ordering === undefined || p.ordering === 'ascending' || p.ordering === 'descending';
            if (!isNonEmptyString(p.leaderboardId) || !Number.isInteger(p.score) || !orderingOk) return fail(errors.INVALID_PARAMS);
            return ok({ ok: true, submittedScore: p.score, newScore: p.score });
        }
        if (action === 'present') return ok({ ok: true, presented: true });
        return fail(errors.INVALID_PARAMS);
    };

    const subscription: Handler = (action) => {
        if (action === 'getStatus') return ok({ eligible: lensPlus });
        if (action === 'requestUpgrade') {
            if (lensPlus) return ok({ subscribed: true });
            if (typeof console !== 'undefined') console.info('[snapchat stub] presenting fake upsell card (subscribes in 500ms)');
            return new Promise((resolve) => {
                setTimeout(() => {
                    const flipped = !lensPlus;
                    lensPlus = true;
                    resolve({ subscribed: true });
                    // Native pushes only when the entitlement actually flips — same here.
                    if (flipped) simulatePush('subscription', 'statusChanged', { eligible: true });
                }, 500);
            });
        }
        return fail(errors.INVALID_PARAMS);
    };

    const bitmoji: Handler = (action, p) => {
        // As on iOS, the two list calls take no target: getFriendAvatars reads only `count`, getVariants nothing.
        if (action === 'getFriendAvatars') {
            const count = p.count;
            if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) return fail(errors.INVALID_PARAMS);
            return ok({ avatars: STUB_FRIENDS.slice(0, Math.min(count, STUB_MAX_BATCH_COUNT)).map(avatar => ({ avatar })) });
        }
        if (action === 'getVariants') return ok({ variants: STUB_VARIANTS.slice() });
        if (hasOwn(p, 'participant')) return fail(errors.INVALID_PARAMS);
        const avatar = p.avatar;
        if (avatar !== undefined && avatar !== null && STUB_FRIENDS.indexOf(avatar as string) === -1) return fail(errors.INVALID_PARAMS);
        if (action === 'getAvatarInfo') return ok({ hasAvatar: true, maxBatchCount: STUB_MAX_BATCH_COUNT });
        if (action === 'get2DAvatar') {
            if (p.variant !== undefined && STUB_VARIANTS.indexOf(p.variant as string) === -1) return fail(errors.INVALID_PARAMS);
            if (p.size !== undefined && ['small', 'normal', 'large'].indexOf(p.size as string) === -1) return fail(errors.INVALID_PARAMS);
            return ok({ url: PNG_URL });
        }
        if (action === 'get3DAvatar') {
            const levels = ['low', 'medium', 'high'];
            for (const key of ['meshQuality', 'textureQuality']) {
                const level = p[key];
                if (level !== undefined && level !== null && levels.indexOf(level as string) === -1) return fail(errors.INVALID_PARAMS);
            }
            return ok({ url: GLB_URL });
        }
        return fail(errors.INVALID_PARAMS);
    };

    const storage: Handler = (action, p) => {
        const key = p.key;
        switch (action) {
            case 'get':
                if (!hasExactly(p, ['key']) || !isValidKey(key)) return fail(errors.INVALID_PARAMS);
                return ok(store.has(key) ? { found: true, value: JSON.parse(store.get(key) as string) } : { found: false });
            case 'set': {
                if (!hasExactly(p, ['key', 'value']) || !isValidKey(key) || p.value === undefined) return fail(errors.INVALID_PARAMS);
                let encoded: string | undefined;
                try {
                    encoded = JSON.stringify(p.value);
                } catch {
                    return fail(errors.INVALID_PARAMS);
                }
                if (encoded === undefined || utf8Length(encoded) > STORAGE_LIMITS.valueLimit) return fail(errors.INVALID_PARAMS);
                const previous = store.has(key) ? jsonBytes(key) + utf8Length(store.get(key) as string) : 0;
                const next = storeBytes - previous + jsonBytes(key) + utf8Length(encoded);
                const keyCount = store.size + (previous ? 0 : 1);
                if (next > STORAGE_LIMITS.byteLimit || keyCount > STORAGE_LIMITS.keyLimit) return fail(errors.QUOTA_EXCEEDED);
                store.set(key, encoded);
                storeBytes = next;
                return ok({});
            }
            case 'remove':
                if (!hasExactly(p, ['key']) || !isValidKey(key)) return fail(errors.INVALID_PARAMS);
                if (store.has(key)) {
                    storeBytes -= jsonBytes(key) + utf8Length(store.get(key) as string);
                    store.delete(key);
                }
                return ok({});
            case 'clear':
                if (!hasExactly(p, [])) return fail(errors.INVALID_PARAMS);
                store = new Map();
                storeBytes = 0;
                return ok({});
            case 'keys':
                if (!hasExactly(p, [])) return fail(errors.INVALID_PARAMS);
                return ok({ keys: Array.from(store.keys()).sort() });
            case 'getInfo':
                if (!hasExactly(p, [])) return fail(errors.INVALID_PARAMS);
                return ok({
                    bytesUsed: storeBytes,
                    byteLimit: STORAGE_LIMITS.byteLimit,
                    keyCount: store.size,
                    keyLimit: STORAGE_LIMITS.keyLimit,
                    valueLimit: STORAGE_LIMITS.valueLimit,
                    persistenceMode: 'inMemory'
                });
            default:
                return fail(errors.INVALID_PARAMS);
        }
    };

    // Nothing vibrates on a desktop; only the params are checked.
    const haptics: Handler = (action, p) => {
        let length: number | null = null;
        if (action === 'impact') {
            if (hasOnly(p, ['style']) && (p.style === undefined || IMPACT_STYLES.indexOf(p.style as string) !== -1)) length = 0;
        } else if (action === 'pattern') {
            if (hasExactly(p, ['events'])) length = patternLength(p.events);
        }
        if (length === null) return fail(errors.INVALID_PARAMS);
        return ok({});
    };

    const capabilities: Record<string, Handler> = {
        sdk: (action) => {
            if (action !== 'getCapabilities') return fail(errors.INVALID_PARAMS);
            return ok({ capabilities: { leaderboards: 1, subscription: 1, bitmoji: 2, games_storage: 1, haptics: 1 } });
        },
        leaderboards,
        subscription,
        bitmoji,
        games_storage: storage,
        haptics
    };

    return (message: BridgeMessage) => {
        const [capability, action] = message.uri.replace('app://', '').split('/');
        const handler = hasOwn(capabilities, capability) ? capabilities[capability] : undefined;
        const params = isObject(message.params) ? message.params : {};
        const result = handler ? handler(action, params) : fail(errors.UNKNOWN_CAPABILITY);
        if (typeof console !== 'undefined') {
            result.then(
                v => console.info('[snapchat stub]', message.uri, params, '->', v),
                (e: Error) => console.info('[snapchat stub]', message.uri, params, '->', e.message)
            );
        }
        return result;
    };
}
