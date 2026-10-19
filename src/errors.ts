// Copyright © 2026 Snap Inc.
// SPDX-License-Identifier: MIT

import type { WebLensAPIErrors } from './types';

/** Stable error codes. A rejected call's `error.message` is always one of these. */
export const errors: WebLensAPIErrors = Object.freeze({
    MALFORMED_REQUEST: 'ERR_MALFORMED_REQUEST',
    UNKNOWN_CAPABILITY: 'ERR_UNKNOWN_CAPABILITY',
    INVALID_PARAMS: 'ERR_INVALID_PARAMS',
    INTERNAL: 'ERR_INTERNAL',
    QUOTA_EXCEEDED: 'ERR_QUOTA_EXCEEDED',
    STORAGE_UNAVAILABLE: 'ERR_STORAGE_UNAVAILABLE',
    UNSUPPORTED_HOST: 'ERR_UNSUPPORTED_HOST'
} as const);

export function bridgeError(code: string): Error {
    return new Error(code);
}

// Native rejections arrive as whatever the WebView produced; games only ever see an Error whose
// message is an ERR_* code.
export function normalizeRejection(reason: unknown): Error {
    const message =
        reason && typeof (reason as { message?: unknown }).message === 'string' ?
            (reason as { message: string }).message :
            typeof reason === 'string' ?
                reason :
                '';
    return bridgeError(message.indexOf('ERR_') === 0 ? message : errors.INTERNAL);
}
