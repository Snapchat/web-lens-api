// Copyright © 2026 Snap Inc.
// SPDX-License-Identifier: MIT
//
// Fails when package-lock.json downloads a package from anywhere but the public npm registry. Installing
// through a private mirror records the mirror's URLs, which nobody outside that network can fetch. Public
// URLs work everywhere: npm maps them onto whatever registry a developer has configured.
//
//   node scripts/check-lockfile.mjs          # check (runs as part of `npm run lint`)
//   node scripts/check-lockfile.mjs --fix    # point mirror URLs at the public registry

import { readFileSync, writeFileSync } from 'node:fs';

const LOCKFILE = 'package-lock.json';
const PUBLIC = 'https://registry.npmjs.org/';

// Registry tarball URLs end in <name>/-/<file>.tgz whichever registry served them, and the tarball is the
// same one, so swapping the prefix keeps the lockfile's integrity hash valid. Some mirrors
// encode a scoped name's slash, as in @scope%2fname/-/name-1.0.0.tgz.
function publicUrl(path, entry) {
    const name = entry.name ?? path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const url = entry.resolved.replace(/%2f/gi, '/');
    const at = url.lastIndexOf(`/${name}/-/`);
    return at >= 0 ? PUBLIC + url.slice(at + 1) : null;
}

let text = readFileSync(LOCKFILE, 'utf8');
const offRegistry = Object.entries(JSON.parse(text).packages ?? {})
.filter(([, entry]) => entry.resolved && !entry.resolved.startsWith(PUBLIC))
.map(([path, entry]) => ({ path, url: entry.resolved, fixed: publicUrl(path, entry) }));

let remaining = offRegistry;
if (process.argv.includes('--fix')) {
    const fixable = offRegistry.filter(e => e.fixed);
    for (const { url, fixed } of fixable) text = text.replaceAll(`"resolved": "${url}"`, `"resolved": "${fixed}"`);
    if (fixable.length) writeFileSync(LOCKFILE, text);
    console.log(`${LOCKFILE}: pointed ${fixable.length} entries at ${PUBLIC}`);
    remaining = offRegistry.filter(e => !e.fixed);
}

if (remaining.length) {
    console.error(`${LOCKFILE} downloads ${remaining.length} package(s) from outside ${PUBLIC}:`);
    for (const { path, url } of remaining.slice(0, 10)) console.error(`  ${path}  ${url}`);
    if (remaining.length > 10) console.error(`  …and ${remaining.length - 10} more`);
    console.error(remaining.every(e => e.fixed) ?
        'Run `node scripts/check-lockfile.mjs --fix` to point them at the public registry.' :
        'Some are not registry tarballs; resolve them from the public registry by hand.');
    process.exitCode = 1;
}
