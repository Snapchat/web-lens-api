// Copyright © 2026 Snap Inc.
// SPDX-License-Identifier: MIT
//
// The PlayCanvas example loads the engine and this API as plain <script> tags, so this just copies the
// two files next to its index.html. Needs dist/ first.
//
//   npm run build && node scripts/build-examples.mjs

import { copyFileSync, existsSync } from 'node:fs';

if (!existsSync('dist/snap-api.js')) throw new Error('dist/ is missing: run `npm run build` first');

const dir = 'examples/bitmoji-dance';
copyFileSync('node_modules/playcanvas/build/playcanvas.min.js', `${dir}/playcanvas.min.js`);
copyFileSync('dist/snap-api.js', `${dir}/snap-api.js`);
console.log(`copied playcanvas.min.js and snap-api.js into ${dir}/`);
