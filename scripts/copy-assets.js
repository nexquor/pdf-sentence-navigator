/**
 * Copy static assets to the dist/ directory alongside the compiled TypeScript.
 * Run after `tsc` as part of `npm run build`.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// Files to copy from project root → dist/
const ASSETS = [
  'manifest.json',
  'viewer.html',
  'pdf.min.js',
  'pdf.worker.min.js',
];

// Ensure dist exists
if (!fs.existsSync(DIST)) {
  fs.mkdirSync(DIST, { recursive: true });
}

for (const file of ASSETS) {
  const src = path.join(ROOT, file);
  const dest = path.join(DIST, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`  ✓ ${file}`);
  } else {
    console.warn(`  ✗ ${file} — not found, skipping`);
  }
}

console.log('\nAssets copied to dist/');
