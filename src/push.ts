// Copyright © 2026 Snap Inc.
// SPDX-License-Identifier: MIT

// Host events (`snapWebLensPush`) behind subscription.onStatusChanged.

import type { HostGlobal } from './transport';

type Listener = (payload: any) => void;

interface PushEventData {
    capability?: string;
    event?: string;
    json?: string;
}

export interface PushHub {
    /** Registers `callback` for `<capability>/<event>`; returns a one-shot unsubscribe. */
    add(capability: string, event: string, callback: Listener): () => void;
    /** Dispatches a fake native push through the same window event native uses. */
    simulate(capability: string, event: string, payload: unknown): void;
}

export function createPushHub(global: HostGlobal): PushHub {
    const listeners = new Map<string, Listener[]>();
    const key = (capability: string, event: string) => `${capability}/${event}`;

    if (global.addEventListener) {
        global.addEventListener('snapWebLensPush', (event: { data?: PushEventData | null }) => {
            const data = event && event.data;
            if (!data || !data.capability || !data.event) return;
            const list = listeners.get(key(data.capability, data.event));
            if (!list || !list.length) return;
            let payload: unknown;
            try {
                payload = JSON.parse(data.json as string);
            } catch {
                return;
            }
            // Snapshot before iterating: a listener may unsubscribe itself mid-dispatch.
            for (const listener of list.slice()) {
                try {
                    listener(payload);
                } catch (e) {
                    // One throwing listener must not starve the others.
                    if (typeof console !== 'undefined' && typeof console.error === 'function') {
                        console.error('[snapchat] push listener threw', e);
                    }
                }
            }
        });
    }

    return {
        add(capability, event, callback) {
            if (typeof callback !== 'function') throw new TypeError('snapchat: listener must be a function');
            const k = key(capability, event);
            const list = listeners.get(k) || [];
            list.push(callback);
            listeners.set(k, list);
            let removed = false; // a double unsubscribe must not remove another registration of the same callback
            return () => {
                if (removed) return;
                removed = true;
                const current = listeners.get(k);
                const index = current ? current.indexOf(callback) : -1;
                if (current && index !== -1) current.splice(index, 1);
                if (current && !current.length) listeners.delete(k);
            };
        },
        simulate(capability, event, payload) {
            if (!global.dispatchEvent) return;
            global.dispatchEvent(
                new MessageEvent('snapWebLensPush', { data: { capability, event, json: JSON.stringify(payload) } })
            );
        }
    };
}
