# Snapchat Web Lens API

`@snap/web-lens-api` is the one script a Web Lens includes to reach native Snapchat capabilities:
**leaderboards**, the user's **Bitmoji**, and account-bound **storage**. It talks to
the native JS bridge on iOS and Android, and falls back to a built-in **desktop stub** so you can build
and debug the whole game in a normal browser, the [PlayCanvas Editor](https://playcanvas.com) launch page,
or any local dev server.

The source is TypeScript (`src/`), built to `dist/`:

| File | Use |
|---|---|
| `dist/snap-api.js` | Classic `<script>` include. Installs `window.snapchat`. Also exported as `@snap/web-lens-api/snap-api.js`. |
| `dist/snap-api.mjs` | The package entry, an ES module; the same singleton as `window.snapchat`. |
| `dist/types/` | TypeScript declarations (`index.d.mts`). They type-check under `bundler`, `node16`/`nodenext` and `node10` resolution. |

## Install

```bash
npm install @snap/web-lens-api
```

```js
import snapchat from '@snap/web-lens-api';    // ESM (Vite, esbuild, PlayCanvas ESM scripts)
```

```html
<script src="snap-api.js"></script>            <!-- classic include: window.snapchat -->
```

The package is ESM-only: there is no CommonJS build. Vitest loads it as is. Jest's default CommonJS mode
cannot, so run Jest in its ESM mode (`node --experimental-vm-modules node_modules/jest/bin/jest.js`) with test
files written as ES modules.

Put the file in your game's zip (the one you upload to My Lenses, with `index.html` at its root): the Lens CSP
intentionally blocks fetching it at runtime.
Including the script twice is safe; the second copy returns the first instance.

## Usage

```js
await snapchat.init();                                    // discovers what this host serves

if (snapchat.isSupported('leaderboards')) {
  // Lower-is-better games must pass ordering: 'ascending' on every submission. score is an integer.
  await snapchat.leaderboards.submitScore({ score: 42 });
  // Opens the Lens's own native leaderboard panel (trophy UI); submit first so it has data.
  await snapchat.leaderboards.show();
}

if (snapchat.isSupported('bitmoji')) {
  const { hasAvatar } = await snapchat.bitmoji.getAvatarInfo();
  const { variants } = await snapchat.bitmoji.getVariants();      // unnamed variant ids, server-curated
  const { url } = await snapchat.bitmoji.get2DAvatar({ variant: variants[0], size: 'large' });
  const glb = await snapchat.bitmoji.get3DAvatar();               // rigged GLB on the Bitmoji rig, no clips
}

if (snapchat.isSupported('storage')) {
  const { found, value } = await snapchat.storage.get('save');    // per-Lens, account-bound JSON store
  await snapchat.storage.set('save', { level: found ? value.level + 1 : 1 });
}
```

Capabilities are discovered at runtime, so call `init()` once and check `isSupported()` before using one; any call
can still reject (see [Errors](#errors)). A capability's contract only grows: its version goes up when it gains
actions, and a breaking change ships under a new capability name, so code written against one version keeps
working on newer hosts.

The `examples/` folder in the source repository has one runnable page per capability (not part of the npm package). Full reference docs are
generated from the source with `npm run build:docs` (see [Development](#development)).

## PlayCanvas

### Setup

- **Editor projects.** Upload `dist/snap-api.js` as a Script asset and set its *Loading Type* to
  **Before Engine**. `window.snapchat` is then ready before any of your scripts initialize, and the file is part
  of every build you download, so zip the downloaded build as it is (with `index.html` at the root) and upload it
  to My Lenses. Don't add it under *Settings → External Scripts*: those load from a URL at runtime, which the
  Lens CSP blocks. The Editor's Launch page (`launch.playcanvas.com`) is not a Lens origin, so there every call
  answers with the desktop stub's canned data and logs to the console: iterate there, then test on a device.
- **Engine-only / ESM projects.** `import snapchat from '@snap/web-lens-api'` alongside `playcanvas`; your
  bundler inlines it, so nothing is fetched at runtime.
- **Worked example.** `examples/bitmoji-dance/` in the source repository renders the
  user's Bitmoji with the PlayCanvas engine and plays a dance clip from a GLB on it through the standard anim
  component. It is three script tags and one short `main.js`, with the engine and this API copied in as files,
  which is also what a real upload looks like: everything the game needs is in the zip, so nothing is fetched
  at runtime.

### Recipes

Plain Engine code: `app` is your `pc.Application` (`this.app` inside a script), `snapchat.init()` has resolved
once at startup, and with ES modules the same names come from `playcanvas` instead of the `pc` global.
`isSupported()` is false until `init()` resolves, so a check in a script's `initialize()` that doesn't await it
reads as "not supported". Every recipe has a fallback, because a capability can be missing, the user may have no
Bitmoji, and any call can reject.

**Loading and freeing assets.** Bitmoji URLs are opaque and expire after about five minutes, so load each one as
soon as you get it, and call the API again for the next load rather than keeping the URL. Neither needs a file
extension: the asset type is enough. An explicit asset keeps loading and freeing side by side:

```js
// Registers and loads an asset; resolves when it is ready, and rejects (unregistering it) on error.
function loadAsset(name, type, url) {
  const asset = new pc.Asset(name, type, { url });
  return new Promise((resolve, reject) => {
    asset.ready(() => resolve(asset));
    asset.once('error', (err) => {
      app.assets.remove(asset);
      reject(err);
    });
    app.assets.add(asset);
    app.assets.load(asset);
  });
}

// Frees an asset from loadAsset. Destroy the entities that use it first.
function unloadAsset(asset) {
  asset.unload();                // for a GLB, this also frees its meshes, materials and textures
  app.assets.remove(asset);
}
```

**Bitmoji as a 3D character.** Bitmoji GLBs share one rig, Snap's own rather than a humanoid one, and have no
animations, so play clips authored on that rig: a clip made for another skeleton, such as a Mixamo character's,
leaves the avatar in its bind pose. Keep a default avatar on the same rig in your game's zip, for users without a
Bitmoji, failed fetches and the desktop stub (whose GLB is an empty placeholder). If you need one, download Snap's
public default Bitmoji (about 2.5 MB) once and add it to the zip:
`https://cf-st.sc-cdn.net/3d/glb/99084526856_24?atlas=false&lod=0&ua=2&usePbr=true`. A Lens can't fetch it at
runtime.

```js
async function loadAvatar() {
  if (snapchat.isSupported('bitmoji') && !snapchat.isStub) {
    try {
      const { hasAvatar } = await snapchat.bitmoji.getAvatarInfo();
      if (hasAvatar) return await loadAsset('avatar', 'container', (await snapchat.bitmoji.get3DAvatar()).url);
    } catch (e) {
      console.warn('Using the default avatar:', e.message);
    }
  }
  return loadAsset('avatar', 'container', 'assets/avatar_default.glb');
}

const [avatarAsset, danceAsset] = await Promise.all([loadAvatar(), loadAsset('dance', 'container', 'assets/dance.glb')]);
const avatar = avatarAsset.resource.instantiateRenderEntity();
avatar.addComponent('anim');
avatar.anim.assignAnimation('Dance', danceAsset.resource.animations[0].resource);
app.root.addChild(avatar);
```

When the character leaves the game, or before loading a different avatar (keep `danceAsset` loaded for the next one,
and pass it to `unloadAsset` once the game is done with the clip):

```js
avatar.destroy();                // first, so nothing still renders the freed meshes
unloadAsset(avatarAsset);
```

**Bitmoji as a UI image.** On an image element, here `portrait` (an entity with an `element` component of type
`'image'`); keep your own placeholder (`placeholderTexture` below) on it for when there is no Bitmoji:

```js
async function loadAvatarImage() {
  if (!snapchat.isSupported('bitmoji')) return null;
  try {
    const { url } = await snapchat.bitmoji.get2DAvatar({ size: 'large' });   // rejects without a Bitmoji
    return await loadAsset('avatar-image', 'texture', url);
  } catch (e) {
    console.warn('No Bitmoji image:', e.message);
    return null;
  }
}

const imageAsset = await loadAvatarImage();
if (imageAsset) portrait.element.texture = imageAsset.resource;
```

And to free it:

```js
portrait.element.texture = placeholderTexture;
unloadAsset(imageAsset);
```

**Save game.** Storage is per Lens and per account. The first call of a session opens the store and can take
seconds on a cold start, so await it behind a loading state rather than timing it out, and write nothing until it
has answered: a write before then replaces the save that is still being read. Save when the state changes and when
the page is hidden, since a Lens is closed by a swipe with no teardown of its own, but not once per frame: the
host bounds how many calls can be in flight, so a burst rejects `ERR_QUOTA_EXCEEDED`. Chaining writes through one
promise keeps one in flight:

```js
let loaded = false;                                // no writes until the first read has answered
let pending = Promise.resolve();

// If the first read fails, saving stays off for the session rather than writing over a save it couldn't read.
async function loadSave() {
  if (!snapchat.isSupported('storage')) return null;
  await pending;                                   // a later re-read waits for queued saves to land
  try {
    const result = await snapchat.storage.get('save');
    loaded = true;
    return result.found ? result.value : null;
  } catch (e) {
    console.warn('No save:', e.message);           // e.g. ERR_STORAGE_UNAVAILABLE
    return null;
  }
}

// Resolves true once the save lands, false if it was refused or saving is off.
function writeSave(state) {
  if (!loaded) return Promise.resolve(false);
  // Handling the rejection keeps the chain alive: one failed save must not reject every save after it.
  pending = pending
    .then(() => snapchat.storage.set('save', state))      // any JSON up to 32 KiB
    .then(() => true, (e) => {
      console.warn('Save failed:', e.message);            // the previous save is unchanged
      return false;
    });
  return pending;
}

// gameState is your game's current progress, the same value you pass to writeSave() as it changes.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') writeSave(gameState);
});
```

A `get` answers for the account signed in at that moment, so a value read at startup is a copy: write what
changed as it changes, rather than writing that copy back later over saves made since.

**Leaderboard at game over.** Submit first so the panel has data:

```js
async function showLeaderboard(score) {
  if (!snapchat.isSupported('leaderboards')) return;
  try {
    // Integer scores only; a lower-is-better game also passes ordering: 'ascending' every time.
    await snapchat.leaderboards.submitScore({ score: Math.round(score) });
    await snapchat.leaderboards.show();
  } catch (e) {
    console.warn('Leaderboard unavailable:', e.message);
  }
}
```

## Errors

Every call returns a Promise and never throws synchronously. Failures reject with an `Error` whose `message` is
one of `snapchat.errors.*`; there is no native error text to parse, and a failure the API cannot classify (such as
params that cannot be serialized) is `ERR_INTERNAL`:

| Code | Meaning |
|---|---|
| `ERR_MALFORMED_REQUEST` | The request envelope or `app://<capability>/<action>` URI failed validation (API bug — file it). |
| `ERR_UNKNOWN_CAPABILITY` | Not served on this app version / surface / Lens. Check `isSupported()` first. |
| `ERR_INVALID_PARAMS` | Params rejected against the capability's allowlist (bad `ordering`, retired `variant`, a reserved parameter, non-integer `score`, unknown action…). |
| `ERR_INTERNAL` | The capability failed natively; nothing to parse, retry or degrade. |
| `ERR_QUOTA_EXCEEDED` | A `storage` write would exceed the byte or key quota, or too many `storage` calls are in flight; the store is unchanged. |
| `ERR_STORAGE_UNAVAILABLE` | `storage` has no durable backing on this device or session, or the Lens is closing (a save fired as it's swiped away). |
| `ERR_UNSUPPORTED_HOST` | API-only: inside Snapchat, but this app version or its WebView can't serve the API (see below). |

## The three environments

| Environment | Transport | Notes |
|---|---|---|
| iOS Snapchat | `webkit.messageHandlers.snapWebLensBridge` (`WKScriptMessageHandlerWithReply` → Promise) | On app versions without the bridge the handler is absent and the API reports **no capabilities**; it does not fall back to the stub. |
| Android Snapchat | `window.snapWebLensBridge` (`WebViewCompat.addWebMessageListener`): fire-and-forget `postMessage` + one shared reply event; the API correlates replies by `requestId` | Needs a WebView with `WEB_MESSAGE_LISTENER`; otherwise **no capabilities**. Lens pages load from `https://wl<hash>.web-lens.snap.local`. |
| **Desktop browser** | **built-in stub with canned data** | Build and debug the whole game in Chrome DevTools or the PlayCanvas Editor. `snapchat.isStub === true`, and it logs a `console.warn` so a stubbed run is never mistaken for a live one. |

**The stub only runs in an ordinary browser.** It is chosen when neither bridge is present *and* the page is not
served from a Lens origin (`weblens:` on iOS, a `web-lens.snap.local` subdomain on Android), so Chrome device
emulation still gets the stub. Inside Snapchat without a bridge, every call rejects `ERR_UNSUPPORTED_HOST` and
`isSupported()` is `false`, so a well-behaved game hides the feature.

**What the stub can and can't tell you.** It rejects bad params with the same `ERR_*` codes a device returns and
echoes submitted scores, so parameter mistakes show up on the desktop. It can't reproduce what depends on the user or
the device: a user without a Bitmoji, an expired media URL, `ERR_INTERNAL`, durable storage (it stores in memory), or
the limit on `storage` calls in flight, so a save every frame only fails on a device.
Its 3D avatar is an empty placeholder, so show your default avatar there (see the recipes). Test those paths on a
device.

iOS and Android serve the same capabilities; what differs is the app version, so check `isSupported()` rather
than the platform.

Both hosts speak the same wire format, so one bundle runs on both:

```
request  {"requestId","uri":"app://<capability>/<action>","params":{...}}
reply    {"requestId","ok":true,"payload":{...}} | {"requestId","ok":false,"error":"ERR_..."}
```

On the wire, capabilities keep their API names except `storage`, which the hosts serve as `games_storage`; the
API translates between the two.

## Development

```bash
npm install
npm run build        # dist/snap-api.js, dist/snap-api.mjs, dist/types/  (esbuild + tsc)
npm test             # builds, then runs tests/transport-selection.js, tests/api-behaviour.js and tests/types.js
npm run build:docs   # TypeDoc → docs/  (open docs/index.html)
npm run build:examples  # copies playcanvas.min.js and snap-api.js into examples/bitmoji-dance
npm run fetch-avatar    # refreshes the committed default Bitmoji GLB used by that example
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint with @playcanvas/eslint-config (`npx eslint . --fix` applies the fixable rules),
                     # then checks package-lock.json only downloads from registry.npmjs.org
```

Installing through a private npm mirror writes the mirror's URLs into `package-lock.json`, which breaks `npm ci`
for anyone outside that network. Keep using your mirror: run `node scripts/check-lockfile.mjs --fix` before
committing and npm will still route the public URLs through it.

Layout:

```
src/
  index.ts      public singleton, init/isSupported, capability namespaces, global install
  types.ts      every exported interface (this is what TypeDoc renders)
  errors.ts     ERR_* codes and rejection normalisation
  transport.ts  iOS / Android / no-bridge transports and origin-based selection
  stub.ts       desktop stub with native-equivalent validation
scripts/build.mjs   esbuild (IIFE + ESM) then tsc declarations; fails if VERSION ≠ package.json
tests/              framework-free node tests that load dist/snap-api.js like a browser would
examples/           one HTML page per capability, runnable against the stub; bitmoji-dance/ is the PlayCanvas one
scripts/build-examples.mjs      copies the engine and the API into the PlayCanvas example
scripts/fetch-default-avatar.mjs  downloads + strips the public default Bitmoji GLB
scripts/check-lockfile.mjs        fails (or --fix rewrites) lockfile URLs outside registry.npmjs.org
```

The tests run anywhere node does: `transport-selection.js` pins which transport each origin gets;
`api-behaviour.js` pins the runtime contract (Android reply correlation across a double include, iOS
synchronous-throw handling, `init()` degradation, stub fidelity); `types.js` type-checks consumer code against
the built package under each module resolution, so the declarations keep matching what the package exports.
`prepack` rebuilds `dist/` and checks the packed files, so a published tarball always matches its source.

## Publishing

The npm package contains `dist/`, this README and the LICENSE only; examples, scripts, tests and source stay in the repo.
`npm publish` runs from a clean checkout of `main` (a guard refuses otherwise), rebuilds `dist/`, runs the tests,
and publishes publicly under the `@snap` scope on npmjs.org (`publishConfig`).

## License

MIT. See `LICENSE`. The built files in `dist/` carry the notice in a `/*! … */` banner, which bundlers keep by
default, so it survives when a game's bundler builds the API into the game.
