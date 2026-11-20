# Examples

One page per capability, each a single HTML file with no framework and no build step:

| File | Capability | Shows |
|---|---|---|
| `leaderboards.html` | `leaderboards` | submit a score at game over, open the native leaderboard |
| `subscription.html` | `subscription` | gate a level on Lens+, upsell, react to entitlement changes |
| `bitmoji.html` | `bitmoji` | portrait, visual variant picker, fetch the rigged GLB |
| `friends.html` | `bitmoji` v2 | the user's friends' portraits from `getFriendAvatars()`, with a solo fallback |
| `storage.html` | `storage` | load / save / reset a JSON save game |
| `bitmoji-dance/` | `bitmoji` + PlayCanvas | render the avatar in 3D with the PlayCanvas engine and play a dance clip from a GLB on it (needs `npm run build:examples`) |
| `bitmoji-low-poly/` | `bitmoji` + PlayCanvas | load the smaller, meshopt-compressed avatar from `get3DAvatar({ meshQuality: 'low' })` with `pc.meshoptInitialize` and play the same dance on it (needs `npm run build:examples`) |

## Run

Build once, then serve the package root and open an example:

```bash
npm run build
python3 -m http.server 8080
```

Then visit `http://localhost:8080/examples/leaderboards.html`. Outside Snapchat the API picks the
desktop stub (`snapchat.isStub === true`), so every page works with canned data and logs each bridge
call to the console.

To try one on a device, copy the example into a folder as `index.html` with `dist/snap-api.js` next to it,
change the script `src` to `snap-api.js`, then zip the folder and upload it to My Lenses.

## bitmoji-dance (PlayCanvas)

One of the two examples with a dependency, kept as plain as a PlayCanvas tutorial: `index.html` loads three
scripts, `playcanvas.min.js`, `snap-api.js` and `main.js`, and `main.js` uses the `pc.*` globals. The first two
are copied in from `node_modules` and `dist/` by:

```bash
npm run build && npm run build:examples
```

Inside Snapchat it renders the user's own Bitmoji; on the desktop stub (whose GLB is an empty placeholder) or
for a user without an avatar it loads `assets/avatar_default.glb`, a default avatar downloaded and shrunk once by
`npm run fetch-avatar` and committed, because a Lens cannot fetch anything at runtime.

The dance is `assets/dance.glb`, a clip from Snap's own Bitmoji Animation Library authored directly on the
Bitmoji rig. PlayCanvas loads it as a container and the standard anim component plays it on the avatar, so there
is no retargeting, no custom format and no animation code beyond `assignAnimation`. Any GLB animated on the
Bitmoji rig (for example one exported with Lens Studio's Bitmoji animation tools) can replace it. To try it on a
device, zip `index.html`, `main.js`, the two copied scripts and `assets/` together, with `index.html` at the root
of the zip, and upload it to My Lenses.

## bitmoji-low-poly (PlayCanvas)

The same page as `bitmoji-dance`, asking for the smaller model:
`get3DAvatar({ meshQuality: 'low', textureQuality: 'low' })`. A `'medium'` or `'low'` mesh is simplified and
compressed with `EXT_meshopt_compression`, which PlayCanvas 2.24 and later decode once `main.js` calls
`pc.meshoptInitialize({ url: 'meshopt_decoder.mjs' })`. Without that call the model fails to load. The engine
imports the decoder the first time a compressed model loads. `npm run build:examples` copies it in from the
`meshoptimizer` package, along with the engine, the API and the dance example's `dance.glb`.

Inside Snapchat it renders the user's own Bitmoji at low quality. Snapchat before 14.33 ignores both options and
sends the full model, which loads the same way. Elsewhere it loads `assets/avatar_default_low.glb`, the default
avatar as Snapchat serves it at `'low'` (515 KB instead of 1.4 MB, about 6,000 triangles), saved once by
`node scripts/fetch-default-avatar.mjs --low` and committed. The low-poly model keeps the full rig, so the dance
plays on it unchanged. To try it on a device, zip `index.html`, `main.js`, the four copied files and `assets/`
together, with `index.html` at the root of the zip, and upload it to My Lenses.
