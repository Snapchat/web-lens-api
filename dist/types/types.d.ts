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
    /**
     * API-only: a friend Bitmoji call ({@link BitmojiAPI.getFriendAvatars}, or any call passing `avatar`) ran before
     * {@link SnapchatWebLensAPI.init} resolved. Await `init()` once at startup; nothing was sent to the host.
     */
    readonly NOT_INITIALIZED: 'ERR_NOT_INITIALIZED';
}
/** Union of every `ERR_*` string in {@link WebLensAPIErrors}. */
export type WebLensAPIErrorCode = WebLensAPIErrors[keyof WebLensAPIErrors];
/** Capability names, as {@link SnapchatWebLensAPI.init} reports them and {@link SnapchatWebLensAPI.isSupported} takes them. */
export type Capability = 'leaderboards' | 'subscription' | 'bitmoji' | 'storage' | 'haptics' | (string & {});
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
export interface SubscriptionStatus {
    /** Whether the user can use this Lens's Lens+ content right now (see {@link SubscriptionAPI}). */
    eligible: boolean;
}
export interface UpgradeOutcome {
    /** Whether the user has Lens+ when the flow ends. */
    subscribed: boolean;
    /**
     * Set when the upgrade offer didn't complete for a reason other than the user's choice. `too_soon`: the Lens
     * opened moments ago, and Snapchat showed nothing; `already_in_flight`: another upgrade offer is on screen, and
     * Snapchat showed nothing; `user_ineligible`: the user can't buy Lens+ in the app (for example, their subscription
     * is managed elsewhere), and Snapchat tells them so itself.
     */
    reason?: 'too_soon' | 'already_in_flight' | 'user_ineligible';
}
/** Whose Bitmoji a {@link BitmojiAPI} call serves. */
export interface AvatarTarget {
    /**
     * A friend's handle from {@link BitmojiAPI.getFriendAvatars} (`bitmoji` v2). Omit it, or pass `null`, for the
     * current user. Passing one before {@link SnapchatWebLensAPI.init} resolves rejects `ERR_NOT_INITIALIZED`; on a
     * host below `bitmoji` v2, or from another Lens session, `ERR_INVALID_PARAMS`. It never falls back to the user.
     * The target itself must be an object (or omitted): a bare string, or a non-string `avatar`, rejects
     * `ERR_INVALID_PARAMS`.
     */
    avatar?: string | null;
}
export interface AvatarInfo {
    /** Whether the user (or the friend named by `avatar`) has a Bitmoji. */
    hasAvatar: boolean;
    /**
     * The most handles one {@link BitmojiAPI.getFriendAvatars} call returns (host-set: 20 by default, never above
     * 50). Set by hosts serving `bitmoji` v2.
     */
    maxBatchCount?: number;
}
/**
 * One friend from {@link BitmojiAPI.getFriendAvatars}. Pass it straight back as the target of the other Bitmoji
 * calls: `get3DAvatar(friend)`, or `get2DAvatar({ ...friend, size: 'small' })`. More fields may be added later,
 * but never one named like a call option (`size`, `variant`, or any option added later), so spreading an entry
 * into a call's options is always safe. Pass the entry, not its handle: a bare string target rejects
 * `ERR_INVALID_PARAMS`.
 */
export interface FriendAvatar {
    /** Opaque handle for {@link AvatarTarget.avatar}, valid for this Lens session only. Never store or parse it. */
    readonly avatar: string;
}
export interface GetFriendAvatarsParams {
    /** How many friends to return: a whole number ≥ 1. Larger values are clamped to `maxBatchCount`. */
    count: number;
}
/** How much detail a 3D avatar keeps: `'high'` is full quality and the default. */
export type AvatarQuality = 'low' | 'medium' | 'high';
export interface Get3DAvatarParams extends AvatarTarget {
    /**
     * Mesh detail. `'medium'` and `'low'` return a simplified mesh that needs `EXT_meshopt_compression`: load it
     * with a loader that supports meshopt, such as PlayCanvas 2.24+ with `pc.meshoptInitialize`.
     * `'high'` never uses meshopt. Defaults to `'high'`; any other value rejects `ERR_INVALID_PARAMS`.
     */
    meshQuality?: AvatarQuality;
    /** Texture size: `'medium'` and `'low'` return smaller textures. Defaults to `'high'`; any other value rejects `ERR_INVALID_PARAMS`. */
    textureQuality?: AvatarQuality;
}
export interface Get2DAvatarParams extends AvatarTarget {
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
/** The feel of one {@link HapticsAPI.impact}. */
export type ImpactStyle = 'light' | 'medium' | 'heavy' | 'soft';
/** One event of a {@link HapticsAPI.pattern}. Times and durations are integer milliseconds. */
export type HapticEvent = {
    /** Start time from the beginning of the pattern. */
    t: number;
    /** A short, sharp tick. */
    type: 'tap';
    /** 0–1; defaults to 1. */
    intensity?: number;
} | {
    /** Start time from the beginning of the pattern. */
    t: number;
    /** A sustained vibration. */
    type: 'buzz';
    /** 0–1; defaults to 1. */
    intensity?: number;
    /** 1–500. */
    duration: number;
};
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
 * Lens+ content for Web Lenses (`subscription` capability, v1). The game checks whether the user can use its Lens+
 * content and asks Snapchat to show the Lens+ upgrade offer. Snapchat runs the payment: only yes-or-no answers and
 * stable reason strings cross the bridge, never the price, plan, provider or expiry.
 *
 * Snapchat decides who is eligible: on a Lens+ Lens, only users with Lens+. On any other Lens every user is eligible,
 * and `requestUpgrade()` resolves `{ subscribed: true }` at once without showing anything. Snapchat may also make a
 * Lens+ Lens free for everyone, for example during a promotion; keep gating on `eligible`. A Lens you push to your
 * phone isn't a Lens+ Lens, so test the locked path on the desktop stub.
 *
 * When the submission scan finds calls, submitting a new Lens makes it a Lens+ Lens, and an update can't add them to
 * a Lens that isn't one. The scan finds calls on anything named `subscription` (`snapchat.subscription`,
 * `this.subscription`) or on a variable assigned from it, not through a property with another name or a function
 * parameter; a Lens whose calls are all missed is never a Lens+ Lens. The Lens+ guide and the package README list
 * the requirements.
 */
export interface SubscriptionAPI {
    /**
     * Whether the user can use this Lens's Lens+ content right now. {@link SubscriptionAPI} lists when every user can.
     *
     * @example
     * ```js
     * const { eligible } = await snapchat.subscription.getStatus();
     * bonusLevel.locked = !eligible;
     * ```
     */
    getStatus(): Promise<SubscriptionStatus>;
    /**
     * Shows the Lens+ upgrade offer, then Snapchat's paywall if the user taps through, and resolves when they're
     * done. Nothing shows to a user with Lens+, or to anyone on a Lens that isn't a Lens+ Lens: they get
     * `{ subscribed: true }` at once. It resolves `{ subscribed: false, reason }` when Snapchat throttles the offer and
     * shows nothing, or when the user can't buy Lens+ in the app. Rejects `ERR_INTERNAL` when nothing can show it.
     *
     * @example
     * ```js
     * unlockButton.onclick = async () => {
     *     const { subscribed, reason } = await snapchat.subscription.requestUpgrade();
     *     if (subscribed) startBonusLevel();
     *     else if (reason) console.info('Upgrade offer not completed:', reason); // 'too_soon' | 'already_in_flight' | 'user_ineligible'
     * };
     * ```
     */
    requestUpgrade(): Promise<UpgradeOutcome>;
    /**
     * Fires with `{ eligible }` whenever the user's Lens+ status changes while this Lens is open, including
     * after subscribing in another Lens or in Settings. Not every Snapchat version sends these events, so rely on
     * {@link SubscriptionAPI.requestUpgrade}'s `subscribed` and {@link SubscriptionAPI.getStatus} rather than
     * waiting for it.
     *
     * @returns the unsubscribe function (one-shot).
     * @example
     * ```js
     * const unsubscribe = snapchat.subscription.onStatusChanged(({ eligible }) => {
     *     bonusLevel.locked = !eligible;
     * });
     * ```
     */
    onStatusChanged(callback: (status: SubscriptionStatus) => void): () => void;
}
/**
 * Bitmoji avatars (`bitmoji` capability). v1 serves the current user's own Bitmoji. v2 adds friends: get opaque
 * handles from {@link BitmojiAPI.getFriendAvatars} and pass one as `avatar` to the other calls. No avatar id,
 * user id or name ever crosses the bridge. `participant` is a reserved parameter: the calls that take `avatar`
 * reject it with `ERR_INVALID_PARAMS`.
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
    getAvatarInfo(params?: AvatarTarget): Promise<AvatarInfo>;
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
     * `meshQuality` and `textureQuality` trade detail for download size, and work the same for a friend's or
     * another player's Bitmoji. Leave them out for full quality, which every engine can load.
     *
     * Older Snapchat versions (before 14.33) ignore both fields and return the full model, with no error and no
     * way to ask whether they are supported. So a Lens that requests `'medium'` or `'low'` must still load a
     * full-size GLB, and must load a meshopt one when the host sends it. Do not rely on a size or a version check.
     *
     * @example
     * ```js
     * // Load the full-size model everywhere; ask for less only where your engine can read meshopt.
     * const { url } = await snapchat.bitmoji.get3DAvatar({ meshQuality: 'medium', textureQuality: 'low' });
     * const glb = await (await fetch(url)).arrayBuffer(); // meshopt-capable loader: works for both sizes
     * ```
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
    get3DAvatar(params?: Get3DAvatarParams): Promise<MediaURL>;
    /**
     * Opaque handles for the user's friends who share their Bitmoji (`bitmoji` v2), to pass as `avatar` to
     * {@link BitmojiAPI.get2DAvatar}, {@link BitmojiAPI.get3DAvatar} and {@link BitmojiAPI.getAvatarInfo}.
     *
     * The host takes up to `maxBatchCount` of the user's most recent eligible friends (mutual, not blocked, with a
     * Bitmoji they share in Friendmoji), shuffles them once and keeps that list for the session: every call returns
     * the first `count` of it, in the same order, which carries no ranking. Ask once for the most you will show.
     * A user with few eligible friends gets a shorter list, or an empty one; it is never padded and never includes
     * the user. Handles are valid only in the session that got them: never store one, ask again next session.
     *
     * When the host finds no eligible friends, or can't read the friend list (`ERR_INTERNAL`), it keeps that
     * answer for a cooldown (30 s by default) before it looks again, so a call within the cooldown gets the same
     * result without new work. Ask again at a natural break, such as the next round, not in a loop.
     *
     * Check `isSupported('bitmoji', 2)` before calling, like any capability. A call made before
     * {@link SnapchatWebLensAPI.init} resolves rejects `ERR_NOT_INITIALIZED` without reaching the host.
     * `ERR_INVALID_PARAMS` means a bug in the call, such as a bad `count`; `ERR_INTERNAL` means "no friends right now".
     *
     * @example
     * ```js
     * let friends = [];
     * if (snapchat.isSupported('bitmoji', 2)) {
     *     try {
     *         ({ avatars: friends } = await snapchat.bitmoji.getFriendAvatars({ count: 3 }));
     *     } catch (e) {
     *         if (e.message !== snapchat.errors.INTERNAL) throw e; // ERR_INVALID_PARAMS: fix the call
     *         // The friend list is unavailable right now: play solo this round.
     *     }
     * }
     * for (const friend of friends) {
     *     const { url } = await snapchat.bitmoji.get3DAvatar(friend);
     *     spawnFriend(url);
     * }
     * ```
     */
    getFriendAvatars(params: GetFriendAvatarsParams): Promise<{
        avatars: FriendAvatar[];
    }>;
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
 * Device vibration (`haptics` capability, v1). A haptic carries no data, so every Lens may use it. A device with no
 * haptic hardware, or on Android 7 and lower, doesn't list the capability. Use haptics for moments the player causes,
 * such as a hit, a landing or a win, not as a constant background effect.
 *
 * Both calls resolve with nothing. A call within 50 ms of the last haptic, or while a pattern plays, plays nothing, and
 * nothing plays while haptics are off in the device settings. Bad params reject `ERR_INVALID_PARAMS`.
 */
export interface HapticsAPI {
    /**
     * One short impact.
     *
     * @param style - Defaults to `'medium'`.
     * @example
     * ```js
     * ball.on('collision', () => snapchat.haptics.impact('heavy'));
     * ```
     */
    impact(style?: ImpactStyle): Promise<void>;
    /**
     * A timeline of taps and buzzes: 1–16 events, `t` going up, no event starting before the last buzz ends, and
     * everything over by 1000 ms.
     *
     * @example
     * ```js
     * // A success: a soft tap, then a strong one.
     * await snapchat.haptics.pattern([
     *     { t: 0, type: 'tap', intensity: 0.5 },
     *     { t: 80, type: 'tap' }
     * ]);
     * ```
     */
    pattern(events: HapticEvent[]): Promise<void>;
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
    subscription: SubscriptionAPI;
    bitmoji: BitmojiAPI;
    storage: StorageAPI;
    haptics: HapticsAPI;
}
