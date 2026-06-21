#!/usr/bin/env node
// Bundle-budget gate (design-brief §11): gzip the built entry JS + CSS and fail
// if either exceeds budget. Landing JS < 150kB gz, CSS < 30kB gz.
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const ASSETS = 'dist/assets';
const JS_BUDGET = 150 * 1024;
const CSS_BUDGET = 30 * 1024;

const files = readdirSync(ASSETS);
const gz = (f) => gzipSync(readFileSync(join(ASSETS, f))).length;

// The entry chunks are emitted as index-*.js / index-*.css.
const entryJs = files.filter((f) => /^index-.*\.js$/.test(f)).sort((a, b) => gz(b) - gz(a))[0];
const entryCss = files.filter((f) => /^index-.*\.css$/.test(f)).sort((a, b) => gz(b) - gz(a))[0];

let failed = false;
function report(label, file, budget) {
  if (!file) {
    console.error(`✗ ${label}: no matching asset found`);
    failed = true;
    return;
  }
  const size = gz(file);
  const ok = size <= budget;
  if (!ok) failed = true;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${(size / 1024).toFixed(1)} kB gz (budget ${(budget / 1024).toFixed(0)} kB) — ${file}`);
}

report('landing JS', entryJs, JS_BUDGET);
report('CSS', entryCss, CSS_BUDGET);

if (failed) {
  console.error('\nBundle budget exceeded.');
  process.exit(1);
}
console.log('\nBundle within budget.');
