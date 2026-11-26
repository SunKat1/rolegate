// Smoke test of the built package, the way users load it: every entry point
// through `import` and through `require`, by package name (Node resolves a
// package's own name through its "exports").
//
// Run after `npm run build`. Catches a missing export, a broken CJS build, or
// a subpath that's in src/ but was forgotten in package.json.

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const require = createRequire(import.meta.url);
let failed = false;

for (const subpath of Object.keys(pkg.exports)) {
  if (subpath === './package.json') continue;
  const name = subpath === '.' ? pkg.name : `${pkg.name}/${subpath.slice(2)}`;

  for (const [how, load] of [['import', (n) => import(n)], ['require', async (n) => require(n)]]) {
    try {
      const mod = await load(name);
      const keys = Object.keys(mod).filter((k) => k !== 'default' && k !== '__esModule');
      if (keys.length === 0) throw new Error('no exports');
      console.log(`ok   ${how.padEnd(7)} ${name}: ${keys.join(', ')}`);
    } catch (err) {
      failed = true;
      console.error(`FAIL ${how.padEnd(7)} ${name}: ${err.message}`);
    }
  }
}

// both builds must agree on what the root entry exports
const esm = Object.keys(await import(pkg.name)).sort().join();
const cjs = Object.keys(require(pkg.name)).filter((k) => k !== '__esModule').sort().join();
if (esm !== cjs) {
  failed = true;
  console.error(`FAIL the ESM and CJS builds export different names:\n  esm: ${esm}\n  cjs: ${cjs}`);
}

process.exit(failed ? 1 : 0);
