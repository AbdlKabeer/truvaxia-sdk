// Builds the SDK, packs it exactly as `npm publish` would, installs that tarball into the
// example app (the same way a customer would), then starts the example.
//   npm run example
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const sdkRoot = fileURLToPath(new URL('..', import.meta.url));
const app = join(sdkRoot, 'examples', 'vite-app');
const packDir = join(app, '.sdk');
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' });

console.log('\n1/4  Packing the SDK (this runs the build)…');
rmSync(packDir, { recursive: true, force: true });
mkdirSync(packDir, { recursive: true });
run(`npm pack --pack-destination "${packDir}"`, sdkRoot);
const tarball = readdirSync(packDir).find((f) => f.endsWith('.tgz'));
if (!tarball) throw new Error('npm pack produced no tarball');

console.log('\n2/4  Installing the example app\'s own dependencies…');
run('npm install --no-audit --no-fund', app);

console.log(`\n3/4  Installing ${tarball} like a customer would…`);
rmSync(join(app, 'node_modules', 'truvaxia-ai-sdk'), { recursive: true, force: true });
run(`npm install --no-save --no-audit --no-fund "./.sdk/${tarball}"`, app);

if (!existsSync(join(app, '.env.local'))) {
  console.log('\n   (No .env.local yet: copy .env.example to .env.local and add your API key.)');
}

console.log('\n4/4  Starting the example at http://localhost:5175\n');
spawn('npm', ['run', 'dev'], { cwd: app, stdio: 'inherit' });
