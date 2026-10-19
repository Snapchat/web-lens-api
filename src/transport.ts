// Copyright © 2026 Snap Inc.
// SPDX-License-Identifier: MIT
//
// Transports. iOS: WKScriptMessageHandlerWithReply → one Promise per call. Android:
// WebViewCompat.addWebMessageListener → fire-and-forget postMessage plus one shared `message`
// event, so calls are correlated by a client requestId. Desktop: canned stub. Lens host with no
// injected bridge: every call rejects ERR_UNSUPPORTED_HOST.
//
// Request:  {"requestId","uri":"app://<capability>/<action>","params":{...}}
// Reply:    {"requestId","ok":true,"payload":{...}} | {"requestId","ok":false,"error":"ERR_..."}

import { bridgeError, errors, normalizeRejection } from './errors';

export interface BridgeMessage {
    readonly uri: string;
    readonly params: Record<string, unknown>;
}

export type Transport = (message: BridgeMessage) => Promise<unknown>;

interface IosBridge {
    postMessage(message: BridgeMessage): unknown;
}

interface AndroidBridge {
    postMessage(serialized: string): void;
    addEventListener(type: 'message', listener: (event: { data: string }) => void): void;
}

interface AndroidReply {
    requestId?: string | number;
    ok?: boolean;
    payload?: unknown;
    error?: unknown;
}

/** The slice of the host window the API touches; loose on purpose so node harnesses can fake it. */
export interface HostGlobal {
    webkit?: { messageHandlers?: { snapWebLensBridge?: IosBridge } };
    snapWebLensBridge?: AndroidBridge;
    location?: { protocol?: string; hostname?: string };
    addEventListener?: (type: string, listener: (event: any) => void) => void;
    dispatchEvent?: (event: Event) => boolean;
    snapchat?: unknown;
    SnapSDK?: unknown;
}

export function getGlobal(): HostGlobal {
    return (typeof window !== 'undefined' ? window : globalThis) as unknown as HostGlobal;
}

function iosTransport(bridge: IosBridge): Transport {
    return (message) => {
        let reply: unknown;
        try {
            reply = bridge.postMessage(message);
        } catch {
            // Unserializable params (BigInt, functions) throw synchronously in WebKit; keep the call async.
            return Promise.reject(bridgeError(errors.INTERNAL));
        }
        return Promise.resolve(reply).catch((reason: unknown) => {
            throw normalizeRejection(reason);
        });
    };
}

// Native answers every requestId exactly once (matching iOS's reply-handler guarantee). There is
// deliberately no client-side timeout: a slow network-backed call must not be falsely rejected.
function androidTransport(bridge: AndroidBridge): Transport {
    const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
    let seq = 0;
    // Random per-instance prefix, so an API copy in an iframe or a second bundle never claims this one's replies.
    const prefix = `${Math.random().toString(36).slice(2, 8)}-`;

    bridge.addEventListener('message', (event) => {
        let reply: AndroidReply | null;
        try {
            reply = JSON.parse(event.data) as AndroidReply | null;
        } catch {
            return;
        }
        if (!reply || reply.requestId == null) return;
        const entry = pending.get(String(reply.requestId));
        if (!entry) return;
        pending.delete(String(reply.requestId));
        if (reply.ok) entry.resolve(reply.payload);
        else entry.reject(bridgeError(typeof reply.error === 'string' ? reply.error : errors.INTERNAL));
    });

    return message => new Promise((resolve, reject) => {
        const id = prefix + ++seq;
        let serialized: string;
        try {
            serialized = JSON.stringify({ requestId: id, uri: message.uri, params: message.params });
        } catch {
            reject(bridgeError(errors.INTERNAL));
            return;
        }
        pending.set(id, { resolve, reject });
        try {
            bridge.postMessage(serialized);
        } catch {
            pending.delete(id);
            reject(bridgeError(errors.INTERNAL));
        }
    });
}

const noBridgeTransport: Transport = () => Promise.reject(bridgeError(errors.UNSUPPORTED_HOST));

// Detection is by origin, which only the hosts can produce: iOS serves Lens content from the
// `weblens:` scheme, Android from `https://wl<hash>.web-lens.snap.local`. Any other origin is a
// developer's browser and gets the stub, whatever the user agent claims.
const ANDROID_LENS_HOST = /(?:^|\.)web-lens\.snap\.local$/;

function isLensHostContext(loc: HostGlobal['location']): boolean {
    if (!loc) return false;
    if (typeof loc.protocol === 'string' && loc.protocol.toLowerCase() === 'weblens:') return true;
    return ANDROID_LENS_HOST.test((typeof loc.hostname === 'string' ? loc.hostname : '').toLowerCase());
}

export interface SelectedTransport {
    transport: Transport;
    isStub: boolean;
}

export function selectTransport(global: HostGlobal, makeStub: () => Transport): SelectedTransport {
    const ios = global.webkit && global.webkit.messageHandlers && global.webkit.messageHandlers.snapWebLensBridge;
    if (ios) return { transport: iosTransport(ios), isStub: false };

    const android = global.snapWebLensBridge;
    if (android && typeof android.postMessage === 'function') return { transport: androidTransport(android), isStub: false };

    // A real user must never see canned data: this app version has no bridge, or the WebView lacks WEB_MESSAGE_LISTENER.
    if (isLensHostContext(global.location)) return { transport: noBridgeTransport, isStub: false };

    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn('[snapchat] No native bridge. Using the DESKTOP STUB: every value is a canned fixture.');
    }
    return { transport: makeStub(), isStub: true };
}
