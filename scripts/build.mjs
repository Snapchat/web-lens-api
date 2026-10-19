// Copyright © 2026 Snap Inc.
// SPDX-License-Identifier: MIT
//
// Builds dist/: the classic-script bundle games include, the ESM twin for bundlers, and the
// declaration files. `node scripts/build.mjs`

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const entry = readFileSync('src/index.ts', 'utf8');
if (!entry.includes(`const VERSION = '${pkg.version}'`)) {
    throw new Error(`src/index.ts VERSION must match package.json version ${pkg.version}`);
}

const banner = { js: `/*! @snap/web-lens-api v${pkg.version} | Copyright © 2026 Snap Inc. | MIT License */` };
const shared = { entryPoints: ['src/index.ts'], bundle: true, target: 'es2020', banner, legalComments: 'none', logLevel: 'info' };

rmSync('dist', { recursive: true, force: true });

// Classic <script> include: installs window.snapchat. The package entry is the ESM build below.
await build({ ...shared, format: 'iife', outfile: 'dist/snap-api.js' });

await build({ ...shared, format: 'esm', outfile: 'dist/snap-api.mjs' });

const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
execFileSync(process.execPath, [tsc, '-p', 'tsconfig.json'], { stdio: 'inherit' });

// Declarations read as ESM (node16/nodenext) need explicit extensions, and tsc copies import paths verbatim, so
// the source's './errors' becomes './errors.js' here: the name of the .d.ts file's runtime twin.
for (const file of readdirSync('dist/types').filter(name => name.endsWith('.d.ts'))) {
    const path = `dist/types/${file}`;
    const text = readFileSync(path, 'utf8').replace(/(\bfrom\s+|\bimport\(\s*)(['"])(\.{1,2}\/[^'"]+)\2/g,
        (match, lead, quote, specifier) => (/\.[cm]?js$/.test(specifier) ? match : `${lead}${quote}${specifier}.js${quote}`));
    writeFileSync(path, text);
}

// The package has no "type": "module", so TypeScript reads a .d.ts entry as CommonJS under node16/nodenext and
// mistypes the ESM build's default export. The .d.mts extension makes it read as ESM everywhere.
renameSync('dist/types/index.d.ts', 'dist/types/index.d.mts');
