#!/usr/bin/env node
// Scans subdirectories of a sprite folder and writes a manifest.json into each,
// listing all .png/.jpg/.webp files found. Run this whenever you add/remove frames.
//
// Usage:  node tasks/bricks/scripts/gen-sprite-manifests.mjs [folder]
//
// Default folder: apps/web/public/assets/evander-bricks/sprite

import { readdirSync, writeFileSync, statSync } from 'fs';
import { join, relative, resolve, extname, basename } from 'path';
import { fileURLToPath } from 'url';

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

const rootDir = resolve(fileURLToPath(import.meta.url), '../../../..');
const defaultTarget = join(rootDir, 'apps/web/public/assets/evander-bricks/sprite');
const targetDir = resolve(process.argv[2] ?? defaultTarget);

let written = 0;
for (const entry of readdirSync(targetDir)) {
  const fullPath = join(targetDir, entry);
  if (!statSync(fullPath).isDirectory()) continue;
  if (entry.startsWith('.')) continue;

  const images = readdirSync(fullPath)
    .filter(f => IMAGE_EXTS.has(extname(f).toLowerCase()) && !f.startsWith('.'))
    .sort();

  const manifestPath = join(fullPath, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(images, null, 2) + '\n');
  console.log(`  wrote ${relative(rootDir, manifestPath)}  (${images.length} frames)`);
  written += 1;
}

console.log(`\nDone — updated ${written} manifest(s) in ${relative(rootDir, targetDir)}`);
