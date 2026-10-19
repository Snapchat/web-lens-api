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
import { errors } from './errors.js';
import type { SnapchatWebLensAPI } from './types.js';
export type * from './types.js';
export { errors };
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
export declare const snapchat: SnapchatWebLensAPI;
export default snapchat;
declare global {
    interface Window {
        snapchat: SnapchatWebLensAPI;
        /** @deprecated pre-rename alias of `snapchat`; kept for Lenses built against the SDK-era global. */
        SnapSDK: SnapchatWebLensAPI;
    }
}
