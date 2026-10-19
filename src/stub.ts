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
// 1x1 transparent PNG: a valid `url` for <img> and fetch(), so stub code needs no branch.
const PNG_URL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ' +
  'AAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
// Minimal glTF 2.0 binary whose one scene holds one empty node (no meshes): loads in PlayCanvas and
// other GLB loaders. PlayCanvas rejects a GLB with only an asset header, or with an empty scene.
const GLB_URL =
    'data:model/gltf-binary;base64,Z2xURgIAAABgAAAATAAAAEpTT057ImFzc2V0Ijp7InZlcnNpb24iOiIyLjAifSwic2Nl' +
    'bmUiOjAsInNjZW5lcyI6W3sibm9kZXMiOlswXX1dLCJub2RlcyI6W3t9XX0g';
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

export function createStub(): Transport {
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

    const bitmoji: Handler = (action, p) => {
        if (hasOwn(p, 'participant')) return fail(errors.INVALID_PARAMS);
        if (action === 'getAvatarInfo') return ok({ hasAvatar: true });
        if (action === 'getVariants') return ok({ variants: STUB_VARIANTS.slice() });
        if (action === 'get2DAvatar') {
            if (p.variant !== undefined && STUB_VARIANTS.indexOf(p.variant as string) === -1) return fail(errors.INVALID_PARAMS);
            if (p.size !== undefined && ['small', 'normal', 'large'].indexOf(p.size as string) === -1) return fail(errors.INVALID_PARAMS);
            return ok({ url: PNG_URL });
        }
        if (action === 'get3DAvatar') return ok({ url: GLB_URL });
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

    const capabilities: Record<string, Handler> = {
        sdk: (action) => {
            if (action !== 'getCapabilities') return fail(errors.INVALID_PARAMS);
            return ok({ capabilities: { leaderboards: 1, bitmoji: 1, games_storage: 1 } });
        },
        leaderboards,
        bitmoji,
        games_storage: storage
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
