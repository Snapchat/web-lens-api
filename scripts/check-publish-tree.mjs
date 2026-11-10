// Copyright © 2026 Snap Inc.
// SPDX-License-Identifier: MIT
//
// `npm publish` packs the working directory, and `prepack` rebuilds dist/ from whatever src/ holds, so a
// publish from a checkout with uncommitted API changes would ship them. Refuse unless the tree is clean.
import { execSync } from 'node:child_process';

const dirty = execSync('git status --porcelain -- src tests dist package.json', { encoding: 'utf8' }).trim();
if (dirty) {
    console.error(`Refusing to publish: uncommitted changes in\n${dirty}\nCommit or stash them, or publish from a clean checkout of main.`);
    process.exit(1);
}
// Tag-triggered CI checks out a detached HEAD, so the branch check only applies to local publishes.
const branch = process.env.GITHUB_ACTIONS ? 'main' : execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
if (branch !== 'main') {
    console.error(`Refusing to publish from branch "${branch}": publish from main.`);
    process.exit(1);
}
