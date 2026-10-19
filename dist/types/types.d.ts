/**
 * Stable error codes. A rejected call's `error.message` is always one of these; native error text
 * never crosses the bridge.
 *
 * @example
 * ```js
 * try {
 *     await snapchat.storage.set('replay', frames);
 * } catch (e) {
 *     // The store is unchanged, so the previous save is still intact.
 *     if (e.message !== snapchat.errors.QUOTA_EXCEEDED) throw e;
 *     await snapchat.storage.remove('replay');
 * }
 * ```
 */
export interface WebLensAPIErrors {
    /** The request envelope or `app://<capability>/<action>` URI failed validation (API bug — file it). */
    readonly MALFORMED_REQUEST: 'ERR_MALFORMED_REQUEST';
    /** No handler is registered for the capability on this app version / surface. Check {@link SnapchatWebLensAPI.isSupported} first. */
    readonly UNKNOWN_CAPABILITY: 'ERR_UNKNOWN_CAPABILITY';
    /** The capability rejected the params against its allowlist. */
    readonly INVALID_PARAMS: 'ERR_INVALID_PARAMS';
    /** The capability failed internally; details stay in native logs. */
    readonly INTERNAL: 'ERR_INTERNAL';
    /** A `storage` write would exceed the per-Lens byte or key-count quota, or too many `storage` calls are in flight; the store is unchanged. */
    readonly QUOTA_EXCEEDED: 'ERR_QUOTA_EXCEEDED';
    /** `storage` has no durable backing on this device or session, or the Lens is closing. */
    readonly STORAGE_UNAVAILABLE: 'ERR_STORAGE_UNAVAILABLE';
    /**
     * API-only: the page runs inside Snapchat, but this app version or its WebView can't serve the API
     * (the host injected no bridge). Every call rejects with it, so hide the feature.
     */
    readonly UNSUPPORTED_HOST: 'ERR_UNSUPPORTED_HOST';
}
/** Union of every `ERR_*` string in {@link WebLensAPIErrors}. */
export type WebLensAPIErrorCode = WebLensAPIErrors[keyof WebLensAPIErrors];
/** Capability names, as {@link SnapchatWebLensAPI.init} reports them and {@link SnapchatWebLensAPI.isSupported} takes them. */
export type Capability = 'leaderboards' | 'bitmoji' | 'storage' | (string & {});
/** Capability name → contract version, as resolved by {@link SnapchatWebLensAPI.init}. */
export type CapabilityMap = Record<string, number>;
export interface SubmitScoreParams {
    /** @deprecated Not needed; omit it. */
    leaderboardId?: string;
    /** Integer in the safe-integer range; non-integers reject `ERR_INVALID_PARAMS`. */
    score: number;
    /** Lower-is-better games must send `'ascending'` on every submission. Defaults to `'descending'`. */
    ordering?: 'ascending' | 'descending';
}
export interface SubmitScoreResult {
    /** The player's best score on the Lens's board, as the server acknowledged it; absent when the backend omits it. */
    bestScore?: number;
}
export interface Get2DAvatarParams {
    /** Variant id from {@link BitmojiAPI.getVariants}; omit for the default portrait. */
    variant?: string;
    /** Defaults to `'medium'`. */
    size?: 'small' | 'medium' | 'large';
}
export interface MediaURL {
    /**
     * Same-origin, opaque and ephemeral (~5 min): fetch or render promptly, never parse, re-call on
     * error. The shape differs between the stub and a device.
     */
    url: string;
}
export type StorageGetResult = {
    found: true;
    value: unknown;
} | {
    found: false;
};
export interface StorageInfo {
    /** Bytes the store holds now. */
    usedBytes: number;
    /** Per-Lens store cap, in bytes (100 KiB). */
    maxBytes: number;
    /** Keys the store holds now. */
    keyCount: number;
    /** Per-Lens key cap (256). */
    maxKeys: number;
    /** Per-value cap, in bytes of JSON (32 KiB). */
    maxValueBytes: number;
    /** `memory` for Lens Studio previews and the desktop stub. */
    persistenceMode: 'disk' | 'memory';
}
/**
 * Native leaderboards (`leaderboards` capability, v1). Only Lenses configured with the leaderboard
 * module see it in {@link SnapchatWebLensAPI.init}.
 */
export interface LeaderboardsAPI {
    /**
     * Submits a score to the Lens's leaderboard.
     *
     * @example
     * ```js
     * // A time trial: lower is better, so say so on every submission.
     * const { bestScore } = await snapchat.leaderboards.submitScore({
     *     score: Math.round(lapSeconds * 1000), // integers only
     *     ordering: 'ascending'
     * });
     * if (bestScore !== undefined) bestLabel.textContent = `Best: ${bestScore} ms`;
     * ```
     */
    submitScore(params: SubmitScoreParams): Promise<SubmitScoreResult>;
    /**
     * Opens the Lens's own native leaderboard panel. Submit first so it has data; rejects
     * `ERR_INTERNAL` when nothing can host it or no board data loads within the bounded wait.
     *
     * @example
     * ```js
     * await snapchat.leaderboards.submitScore({ score });
     * await snapchat.leaderboards.show();
     * ```
     */
    show(): Promise<void>;
}
/**
 * The current user's own Bitmoji (`bitmoji` capability, v1). No avatar id ever crosses the bridge.
 * `participant` is a reserved parameter: every v1 action rejects it with `ERR_INVALID_PARAMS`.
 *
 * Always keep a default Bitmoji as a fallback: `hasAvatar` may be `false` and any media call may reject
 * `ERR_INTERNAL`, and a game should never show an empty character in either case. Put the fallback GLB in
 * your game's zip: a Lens cannot fetch it from the network at runtime.
 */
export interface BitmojiAPI {
    /**
     * Whether the current user has a Bitmoji. Check it before the media calls, which reject
     * `ERR_INTERNAL` for a user without one.
     *
     * @example
     * ```js
     * const { hasAvatar } = await snapchat.bitmoji.getAvatarInfo();
     * if (!hasAvatar) useDefaultCharacter();
     * ```
     */
    getAvatarInfo(): Promise<{
        hasAvatar: boolean;
    }>;
    /**
     * A head-and-shoulders 2D render of the avatar: the default portrait, or one of the variants from
     * {@link BitmojiAPI.getVariants}. Rejects `ERR_INVALID_PARAMS` for a `variant` outside the current
     * set (variants can retire server-side — fall back to the portrait) and `ERR_INTERNAL` when the
     * user has no Bitmoji.
     *
     * @example
     * ```js
     * let image;
     * try {
     *     image = await snapchat.bitmoji.get2DAvatar({ variant: savedVariant, size: 'large' });
     * } catch (e) {
     *     if (e.message !== snapchat.errors.INVALID_PARAMS) throw e;
     *     // The variant has retired: show the portrait instead.
     *     image = await snapchat.bitmoji.get2DAvatar({ size: 'large' });
     * }
     * avatarImg.src = image.url; // render promptly: the URL expires after ~5 min
     * ```
     */
    get2DAvatar(params?: Get2DAvatarParams): Promise<MediaURL>;
    /**
     * The rigged avatar GLB, with no clips: bundle your own, authored on the Bitmoji rig. Rejects
     * `ERR_INTERNAL` when the user has no Bitmoji or the model fetch fails; the URL is never empty.
     *
     * Every Bitmoji has the same rig, and it is Snap's own, not a Mixamo-style humanoid: joints are
     * named like `L_armUpper0001_bind_JNT`, and most have a child that is not a joint
     * (`L_armUpper0001_bind_JNT_SSC`) between them and the next joint. Find bones by name anywhere
     * under the root, not among a node's direct children. A clip authored on another skeleton leaves
     * the avatar in its bind pose.
     *
     * @example
     * ```js
     * // Keep a default avatar in your game's zip for users without a Bitmoji and for failed fetches.
     * let url = './assets/avatar_default.glb';
     * try {
     *     const { hasAvatar } = await snapchat.bitmoji.getAvatarInfo();
     *     if (hasAvatar) url = (await snapchat.bitmoji.get3DAvatar()).url;
     * } catch {
     *     // ERR_INTERNAL: keep the default.
     * }
     * const glb = await (await fetch(url)).arrayBuffer(); // hand this to your engine's GLB loader
     * ```
     */
    get3DAvatar(): Promise<MediaURL>;
    /**
     * The server-curated set of 2D variants: head-and-shoulders renders of the avatar, the same set the
     * native selfie picker offers. Ids are unnamed: build a visual picker by rendering each via
     * `get2DAvatar({ variant, size: 'small' })` in small batches (~6), so the user's own avatar in each
     * variant is its label. Or pick ids at authoring time and keep them as data, falling back to the
     * portrait when one retires.
     *
     * @example
     * ```js
     * const { variants } = await snapchat.bitmoji.getVariants();
     * for (let i = 0; i < variants.length; i += 6) {
     *     const batch = variants.slice(i, i + 6);
     *     const images = await Promise.all(batch.map(variant => snapchat.bitmoji.get2DAvatar({ variant, size: 'small' })));
     *     images.forEach(({ url }, j) => addVariantButton(batch[j], url));
     * }
     * ```
     */
    getVariants(): Promise<{
        variants: string[];
    }>;
}
/**
 * Account-bound key/value persistence for this Lens (`storage` capability, v1). Values are
 * JSON (≤ 32 KiB each); keys are non-empty strings (≤ 256 bytes). Writes past the store quota
 * reject `ERR_QUOTA_EXCEEDED` and leave the store unchanged; `ERR_STORAGE_UNAVAILABLE` means no
 * durable backing exists on this device or session, or that the Lens is closing, as when a save
 * fires while it is swiped away. Lens Studio previews and the desktop stub persist in memory only.
 *
 * The first call of a session opens the store and can take seconds on a cold start: await it rather
 * than timing it out, and write nothing until it has answered, or the write replaces the save still
 * being read. Write as the state changes and when the page is hidden, since a Lens is closed by a
 * swipe with no teardown of its own.
 */
export interface StorageAPI {
    /**
     * Reads one key, for the account signed in now. `found` tells a missing key apart from a stored
     * `null`.
     *
     * @example
     * ```js
     * const result = await snapchat.storage.get('save');
     * const save = result.found ? result.value : { level: 1, coins: 0 };
     * ```
     */
    get(key: string): Promise<StorageGetResult>;
    /**
     * Writes one key, replacing any previous value. Save on a change of state, not once per frame:
     * the host bounds how many calls can be in flight, so a burst rejects `ERR_QUOTA_EXCEEDED`.
     *
     * @param value - Any JSON-serializable value.
     * @example
     * ```js
     * // One chain keeps one write in flight, and the catch keeps it going after a failed save.
     * let pending = Promise.resolve();
     * const save = state => (pending = pending
     *     .then(() => snapchat.storage.set('save', state))
     *     .catch(e => console.warn('Save failed:', e.message)));
     * ```
     */
    set(key: string, value: unknown): Promise<void>;
    /**
     * Idempotent: removing a missing key resolves.
     *
     * @example
     * ```js
     * await snapchat.storage.remove('save');
     * ```
     */
    remove(key: string): Promise<void>;
    /**
     * Deletes this Lens's whole store for the current account.
     *
     * @example
     * ```js
     * resetButton.onclick = () => snapchat.storage.clear();
     * ```
     */
    clear(): Promise<void>;
    /**
     * Stored keys in byte-lexicographic order.
     *
     * @example
     * ```js
     * const { keys } = await snapchat.storage.keys();
     * const slots = keys.filter(key => key.startsWith('slot:'));
     * ```
     */
    keys(): Promise<{
        keys: string[];
    }>;
    /**
     * Usage against the store's limits, and whether it persists across sessions.
     *
     * @example
     * ```js
     * const { usedBytes, maxBytes, persistenceMode } = await snapchat.storage.getInfo();
     * if (persistenceMode === 'memory') console.warn('Progress will not survive a restart here');
     * ```
     */
    getInfo(): Promise<StorageInfo>;
}
/**
 * The `window.snapchat` singleton: one include for iOS, Android, and desktop development.
 *
 * Every call returns a Promise. Failures reject with an `Error` whose `message` is one of the
 * stable codes in {@link SnapchatWebLensAPI.errors}; there is no native error text to parse. Calls
 * never throw synchronously: a failure the API cannot classify, such as params that cannot be
 * serialized, rejects with `ERR_INTERNAL`.
 */
export interface SnapchatWebLensAPI {
    /** API version (semver). */
    readonly version: string;
    readonly errors: WebLensAPIErrors;
    /**
     * True when running against the desktop stub instead of a Snapchat host.
     *
     * @example
     * ```js
     * // The stub's 3D avatar is an empty placeholder GLB, so show the bundled default instead.
     * const showUserAvatar = snapchat.isSupported('bitmoji') && !snapchat.isStub;
     * ```
     */
    readonly isStub: boolean;
    /**
     * Fetches and caches the capabilities this host serves. Call once at startup, before
     * {@link SnapchatWebLensAPI.isSupported}.
     *
     * Resolves `{}` (nothing supported) instead of rejecting when discovery itself is unavailable: no
     * bridge at all, or a host too old to answer `sdk/getCapabilities`. Genuine failures
     * (`ERR_INTERNAL`, `ERR_INVALID_PARAMS`) still reject.
     *
     * @example
     * ```js
     * await snapchat.init();
     * leaderboardButton.hidden = !snapchat.isSupported('leaderboards');
     * ```
     */
    init(): Promise<CapabilityMap>;
    /**
     * Whether the host serves `capability` at contract version `minVersion` (default 1) or newer.
     * Always false before {@link SnapchatWebLensAPI.init} resolves.
     *
     * A capability's contract only grows: its version goes up when it gains actions, and a breaking
     * change ships under a new capability name, so a `minVersion` check keeps working on newer hosts.
     *
     * @example
     * ```js
     * snapchat.isSupported('bitmoji'); // false: init() has not resolved yet
     * await snapchat.init();
     * snapchat.isSupported('bitmoji'); // true where the host serves bitmoji v1 or newer
     * ```
     */
    isSupported(capability: Capability, minVersion?: number): boolean;
    leaderboards: LeaderboardsAPI;
    bitmoji: BitmojiAPI;
    storage: StorageAPI;
}
