# Examples

One page per capability, each a single HTML file with no framework and no build step:

| File | Capability | Shows |
|---|---|---|
| `leaderboards.html` | `leaderboards` | submit a score at game over, open the native leaderboard |
| `bitmoji.html` | `bitmoji` | portrait, visual variant picker, fetch the rigged GLB |
| `storage.html` | `storage` | load / save / reset a JSON save game |
| `bitmoji-dance/` | `bitmoji` + PlayCanvas | render the avatar in 3D with the PlayCanvas engine and play a dance clip from a GLB on it (needs `npm run build:examples`) |

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

The only example with a dependency, kept as plain as a PlayCanvas tutorial: `index.html` loads three
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
