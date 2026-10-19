// Copyright © 2026 Snap Inc.
// SPDX-License-Identifier: MIT
//
// The package is public while the repository is not, so refuse to pack a file that names an internal host.
// Runs in `prepack` right after the build, so it scans the dist/ that is about to be packed, not a stale one.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path/posix';

const INTERNAL_HOSTS = /github\.sc-corp\.net|registry\.snapchat\.com/;

// What npm packs: the `files` entries plus the files it always includes.
const { files } = JSON.parse(readFileSync('package.json', 'utf8'));
const walk = path => (statSync(path).isDirectory() ? readdirSync(path).flatMap(name => walk(join(path, name))) : [path]);
const packed = [...new Set(['package.json', 'README.md', 'LICENSE', ...files])].filter(existsSync).flatMap(walk);
const leaks = packed.flatMap(file => readFileSync(file, 'utf8').split('\n')
.flatMap((line, i) => (INTERNAL_HOSTS.test(line) ? [`  ${file}:${i + 1}: ${line.trim()}`] : [])));
if (leaks.length) {
    console.error(`Refusing to pack: packaged files name internal hosts\n${leaks.join('\n')}`);
    process.exit(1);
}
