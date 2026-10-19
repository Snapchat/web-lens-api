// Copyright © 2026 Snap Inc.
// SPDX-License-Identifier: MIT
//
// Downloads a public default Bitmoji (UA v2 rig, the same skeleton every user's avatar has) and
// strips the facial morph targets the examples never animate, so the bundled fallback is ~0.9 MB
// instead of ~2 MB. Output is committed; rerun only to refresh it.
//
//   node scripts/fetch-default-avatar.mjs [out.glb]

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const AVATAR_ID = '99084526856_24';
const URL = `https://cf-st.sc-cdn.net/3d/glb/${AVATAR_ID}?atlas=false&lod=0&ua=2&usePbr=true`;
const out = process.argv[2] || 'examples/bitmoji-dance/assets/avatar_default.glb';

const res = await fetch(URL);
if (!res.ok) throw new Error(`${URL} → HTTP ${res.status}`);
const b = Buffer.from(await res.arrayBuffer());
if (b.readUInt32LE(0) !== 0x46546c67) throw new Error('not a binary glTF');

const jsonLen = b.readUInt32LE(12);
const j = JSON.parse(b.subarray(20, 20 + jsonLen).toString());
const bin = b.subarray(20 + jsonLen + 8, 20 + jsonLen + 8 + b.readUInt32LE(20 + jsonLen));

// Drop morph targets (facial blend shapes).
for (const m of j.meshes) {
    delete m.weights;
    if (m.extras) delete m.extras.targetNames;
    for (const p of m.primitives) delete p.targets;
}

// Accessors still in use, remapped densely.
const usedAcc = new Set();
for (const m of j.meshes) {
    for (const p of m.primitives) {
        Object.values(p.attributes).forEach(a => usedAcc.add(a));
        if (p.indices !== undefined) usedAcc.add(p.indices);
    }
}
for (const s of j.skins || []) if (s.inverseBindMatrices !== undefined) usedAcc.add(s.inverseBindMatrices);
for (const an of j.animations || []) {
    for (const s of an.samplers) {
        usedAcc.add(s.input);
        usedAcc.add(s.output);
    }
}
const accMap = new Map([...usedAcc].sort((x, y) => x - y).map((a, i) => [a, i]));
j.accessors = [...accMap.keys()].map(a => j.accessors[a]);
for (const m of j.meshes) {
    for (const p of m.primitives) {
        for (const k in p.attributes) p.attributes[k] = accMap.get(p.attributes[k]);
        if (p.indices !== undefined) p.indices = accMap.get(p.indices);
    }
}
for (const s of j.skins || []) if (s.inverseBindMatrices !== undefined) s.inverseBindMatrices = accMap.get(s.inverseBindMatrices);
for (const an of j.animations || []) {
    for (const s of an.samplers) {
        s.input = accMap.get(s.input);
        s.output = accMap.get(s.output);
    }
}

// BufferViews still in use (accessors, sparse parts, images), copied into a fresh aligned buffer.
const usedBv = new Set();
for (const a of j.accessors) {
    if (a.bufferView !== undefined) usedBv.add(a.bufferView);
    if (a.sparse) {
        usedBv.add(a.sparse.indices.bufferView);
        usedBv.add(a.sparse.values.bufferView);
    }
}
for (const im of j.images || []) if (im.bufferView !== undefined) usedBv.add(im.bufferView);
const bvMap = new Map();
const parts = [];
const views = [];
let off = 0;
for (const v of [...usedBv].sort((x, y) => x - y)) {
    const bv = j.bufferViews[v];
    const pad = (4 - (off % 4)) % 4;
    if (pad) {
        parts.push(Buffer.alloc(pad));
        off += pad;
    }
    parts.push(bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength));
    bvMap.set(v, views.length);
    views.push({ ...bv, buffer: 0, byteOffset: off });
    off += bv.byteLength;
}
j.bufferViews = views;
for (const a of j.accessors) {
    if (a.bufferView !== undefined) a.bufferView = bvMap.get(a.bufferView);
    if (a.sparse) {
        a.sparse.indices.bufferView = bvMap.get(a.sparse.indices.bufferView);
        a.sparse.values.bufferView = bvMap.get(a.sparse.values.bufferView);
    }
}
for (const im of j.images || []) if (im.bufferView !== undefined) im.bufferView = bvMap.get(im.bufferView);
let body = Buffer.concat(parts);
if (body.length % 4) body = Buffer.concat([body, Buffer.alloc(4 - (body.length % 4))]);
j.buffers = [{ byteLength: body.length }];
j.asset = { ...j.asset, extras: { ...(j.asset && j.asset.extras), note: 'default Bitmoji; morph targets stripped by scripts/fetch-default-avatar.mjs' } };

let json = Buffer.from(JSON.stringify(j));
if (json.length % 4) json = Buffer.concat([json, Buffer.alloc(4 - (json.length % 4), 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + body.length, 8);
const chunk = (len, type) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(len, 0);
    h.writeUInt32LE(type, 4);
    return h;
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([header, chunk(json.length, 0x4e4f534a), json, chunk(body.length, 0x004e4942), body]));
console.log(`${URL}\n  ${(b.length / 1024).toFixed(0)} KB → ${out} ${((12 + 16 + json.length + body.length) / 1024).toFixed(0)} KB`);
