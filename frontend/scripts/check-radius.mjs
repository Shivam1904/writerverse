#!/usr/bin/env node
/**
 * Radius lint — flags hard-coded, off-token border radii in src/app.
 *
 * The design system defines exactly five radius tokens (app.css):
 *   --r-xs 4 · --r-sm 6 · --r-md 9 · --r-lg 13 · --r-xl 18
 * Anything else (the UX audit found 5/7/8/10/11/12/14/15/16/20 in the wild) is
 * drift — use the nearest `var(--r-*)` instead.
 *
 * Intentionally NOT flagged: pills/circles (>=90px, 99/999, 50%, 100%) and
 * hairline radii (<=3px). Run:  npm run lint:radius
 *
 * NOTE: a backlog of pre-existing violations exists — this is a discovery tool,
 * not yet wired into CI. Keep new code clean; burn the backlog down over time.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src', 'app');
const TOKENS = new Set([4, 6, 9, 13, 18]);
const EXTS = new Set(['.css', '.tsx', '.ts']);

/** A px radius is an offender if it's a real "should-be-a-token" value:
 *  5–40px and not one of the five tokens. (Pills >=90 and hairlines <=3 are fine.) */
const isOffender = (px) => px >= 5 && px <= 40 && !TOKENS.has(px);

const PATTERNS = [
  /border-radius:\s*([\d.]+)px/g, // CSS: border-radius: 10px  (first value of a shorthand too)
  /rounded-\[([\d.]+)px\]/g,      // JSX: rounded-[10px]
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'mockup') continue; // reference mockups — not shipped chrome
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (EXTS.has(p.slice(p.lastIndexOf('.')))) out.push(p);
  }
  return out;
}

const hits = [];
for (const file of walk(ROOT)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const re of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line))) {
        const px = parseFloat(m[1]);
        if (isOffender(px)) hits.push({ file: relative(ROOT, file), line: i + 1, px, text: line.trim() });
      }
    }
  });
}

if (hits.length === 0) {
  console.log('✓ radius lint: no off-token radii in src/app.');
  process.exit(0);
}

const NEAREST = (px) => [4, 6, 9, 13, 18].reduce((a, b) => (Math.abs(b - px) < Math.abs(a - px) ? b : a));
const TOKEN_NAME = { 4: '--r-xs', 6: '--r-sm', 9: '--r-md', 13: '--r-lg', 18: '--r-xl' };

console.log(`✗ radius lint: ${hits.length} off-token radii found (use the nearest var(--r-*)):\n`);
for (const h of hits) {
  const t = TOKEN_NAME[NEAREST(h.px)];
  console.log(`  ${h.file}:${h.line}  ${h.px}px → var(${t})`);
}
process.exit(1);
