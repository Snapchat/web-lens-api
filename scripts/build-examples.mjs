// Copyright © 2026 Snap Inc.
// SPDX-License-Identifier: MIT
//
// The PlayCanvas example loads the engine and this API as plain <script> tags, so this just copies the
// two files next to its index.html. Needs dist/ first.
//
//   npm run build && node scripts/build-examples.mjs

import { copyFileSync, existsSync } from 'node:fs';

if (!existsSync('dist/snap-api.js')) throw new Error('dist/ is missing: run `npm run build` first');

const dance = 'examples/bitmoji-dance';
const lowPoly = 'examples/bitmoji-low-poly';
for (const dir of [dance, lowPoly]) {
    copyFileSync('node_modules/playcanvas/build/playcanvas.min.js', `${dir}/playcanvas.min.js`);
    copyFileSync('dist/snap-api.js', `${dir}/snap-api.js`);
    console.log(`copied playcanvas.min.js and snap-api.js into ${dir}/`);
}
// The low-poly example also needs the meshopt decoder, and plays the dance example's clip.
copyFileSync('node_modules/meshoptimizer/meshopt_decoder.mjs', `${lowPoly}/meshopt_decoder.mjs`);
copyFileSync(`${dance}/assets/dance.glb`, `${lowPoly}/dance.glb`);
console.log(`copied meshopt_decoder.mjs and dance.glb into ${lowPoly}/`);
