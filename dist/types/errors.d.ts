import type { WebLensAPIErrors } from './types.js';
/** Stable error codes. A rejected call's `error.message` is always one of these. */
export declare const errors: WebLensAPIErrors;
export declare function bridgeError(code: string): Error;
export declare function normalizeRejection(reason: unknown): Error;
