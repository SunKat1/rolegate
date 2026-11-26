// Builds both flavours of the package:
//   dist/      ES modules, for `import`
//   dist/cjs/  CommonJS, for `require` (NestJS, older Node setups)
//
// dist/cjs gets its own package.json with "type": "commonjs", otherwise Node
// would read those .js files as ES modules, since the root package says "module".

import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
const run = (project) => execFileSync(process.execPath, [tsc, '-p', project], { stdio: 'inherit' });

// stale files from renamed modules would otherwise end up in the tarball
rmSync('dist', { recursive: true, force: true });

run('tsconfig.build.json');
run('tsconfig.cjs.json');
writeFileSync('dist/cjs/package.json', JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');
