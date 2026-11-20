import type { HostGlobal } from './transport.js';
type Listener = (payload: any) => void;
export interface PushHub {
    /** Registers `callback` for `<capability>/<event>`; returns a one-shot unsubscribe. */
    add(capability: string, event: string, callback: Listener): () => void;
    /** Dispatches a fake native push through the same window event native uses. */
    simulate(capability: string, event: string, payload: unknown): void;
}
export declare function createPushHub(global: HostGlobal): PushHub;
export {};
