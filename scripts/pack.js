// Cross-platform "distribution build" packer.
//
// One command produces a single, self-contained artifact you can copy to any
// host (VM, another PC, a container build context) and run with:
//
//   npm ci --omit=dev && npm run server
//
// It builds the frontend (dist/) then bundles the ONLY files needed at runtime
// into  release/webgl-multiplayer-controller-<version>.tar.gz :
//
//   dist/            compiled, minified frontend
//   server/          Express + Socket.io runtime
//   public/          static assets (logo, etc.)
//   package.json     runtime dependency manifest
//   package-lock.json
//
// Works on Windows, Linux and macOS because it shells out to `tar`, which ships
// with Windows 10+ and every Unix.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const name = pkg.name || 'app';
const version = pkg.version || '0.0.0';

const releaseDir = path.join(root, 'release');
const archiveName = `${name}-${version}.tar.gz`;
const archivePath = path.join(releaseDir, archiveName);

function run(command) {
  // Pass the full command as ONE string with shell:true. Passing a string
  // (instead of an args array) avoids the DEP0190 deprecation warning and works
  // uniformly across Windows (cmd), Linux and macOS (sh).
  const res = spawnSync(command, { cwd: root, stdio: 'inherit', shell: true });
  if (res.error) {
    console.error(`\n[pack] Could not run: ${command}\n${res.error.message}`);
    process.exit(1);
  }
  if (res.status !== 0) {
    console.error(`\n[pack] Command failed: ${command}`);
    process.exit(res.status || 1);
  }
}

// 1. Build the frontend into dist/
console.log('[pack] Building frontend (vite build)...');
run('npm run build');

// 2. Prepare the release/ output directory
fs.mkdirSync(releaseDir, { recursive: true });
if (fs.existsSync(archivePath)) fs.rmSync(archivePath);

// 3. Only ship what the runtime needs
const include = ['dist', 'server', 'public', 'package.json', 'package-lock.json']
  .filter((p) => fs.existsSync(path.join(root, p)));

console.log(`[pack] Bundling: ${include.join(', ')}`);
run(`tar -czf "${archivePath}" ${include.join(' ')}`);

console.log(`\n[pack] Done -> ${path.relative(root, archivePath)}`);
console.log('[pack] Ship it, then on the target host:');
console.log(`  tar -xzf ${archiveName}`);
console.log('  npm ci --omit=dev');
console.log('  npm run server        # or: npm run start (with Cloudflare Tunnel)\n');
