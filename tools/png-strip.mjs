// CG Scope: remove ancillary chunks from the icon PNGs.
//
// Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
// Co-Authored-By: Connected Geek, LLC <support@connectedgeek.net>
//
// Why this exists
// ---------------
// This was written on a wrong diagnosis and kept for a right one. See the
// 2026-09-13 entry in CLAUDE.md.
//
// The wrong diagnosis: icons appeared to arrive in the repository carrying a
// `caBX` provenance chunk of roughly 5.7 KB, so the packaged extension would
// have shipped metadata neither author wrote. Running this script disproved
// that. The files on disk were clean all along; the chunk is added by the
// read-back used to verify them, not by the write.
//
// What it is good for, which is the reason it stays:
//
//   1. It answers "does this PNG carry anything beyond what it needs to
//      render", which byte comparison cannot answer for images here, because
//      the act of reading one adds bytes to it.
//   2. It is idempotent, so running it is always safe, and "already clean" is
//      a useful answer rather than a wasted command.
//
// This is a maintenance script, not part of the build. build.ps1 never calls
// it. Run it by hand after new icons land.
//
//   node tools/png-strip.mjs
//
// It keeps only the chunks a PNG needs to render: IHDR, PLTE, tRNS, IDAT and
// IEND. Everything else is ancillary by definition, because a lowercase first
// letter in a chunk type means decoders may skip it.
//
// Uses Node built-ins only. This project has no dependencies and is not
// acquiring any for a 40-line script.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const KEEP = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);

function strip(bytes, label) {
  if (!bytes.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error(`${label} is not a PNG`);
  }

  const kept = [SIGNATURE];
  const dropped = [];
  let i = 8;

  while (i < bytes.length) {
    const length = bytes.readUInt32BE(i);
    const type = bytes.toString('ascii', i + 4, i + 8);
    const total = 12 + length; // length + type + data + crc

    if (KEEP.has(type)) {
      kept.push(bytes.subarray(i, i + total));
    } else {
      dropped.push(`${type} (${length} bytes)`);
    }

    i += total;

    if (type === 'IEND') break;
  }

  return { out: Buffer.concat(kept), dropped };
}

let changed = 0;

for (const size of [16, 32, 48, 128]) {
  const path = join(REPO, 'icons', `icon${size}.png`);

  if (!existsSync(path)) {
    console.log(`icon${size}.png  missing, skipped`);
    continue;
  }

  const before = readFileSync(path);
  const { out, dropped } = strip(before, `icon${size}.png`);

  if (out.length === before.length) {
    console.log(`icon${size}.png  already clean (${before.length} bytes)`);
    continue;
  }

  writeFileSync(path, out);
  changed++;
  console.log(
    `icon${size}.png  ${before.length} -> ${out.length} bytes, removed ${dropped.join(', ')}`
  );
}

console.log(changed === 0 ? '\nNothing to do.' : `\n${changed} file(s) rewritten.`);
