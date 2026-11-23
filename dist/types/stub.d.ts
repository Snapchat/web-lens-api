import type { Transport } from './transport.js';
export declare function createStub(simulatePush: (capability: string, event: string, payload: unknown) => void): Transport;
