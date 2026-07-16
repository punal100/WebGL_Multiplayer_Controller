import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const PORT = process.env.PORT || 4567;

// --- Start the game server (server/index.js) ---
const server = spawn(process.execPath, ['server/index.js'], {
  stdio: 'inherit',
  env: process.env,
});

// --- Ensure cloudflared is available ---
function cloudflaredPath() {
  // Check PATH first
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['cloudflared']);
  if (probe.status === 0 && probe.stdout.toString().trim()) {
    return probe.stdout.toString().split(/\r?\n/)[0].trim();
  }
  // Bundled location
  const local = path.join(os.homedir(), '.cloudflared', 'cloudflared.exe');
  return fs.existsSync(local) ? local : null;
}

function installCloudflared() {
  console.log('[tunnel] cloudflared not found. Installing (Windows)...');
  const dest = path.join(os.homedir(), '.cloudflared');
  fs.mkdirSync(dest, { recursive: true });
  const exe = path.join(dest, 'cloudflared.exe');
  const url =
    'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(exe);
    http
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error('Download failed: ' + res.statusCode));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(exe)));
      })
      .on('error', reject);
  });
}

async function startTunnel() {
  let exe = cloudflaredPath();
  if (!exe) {
    try {
      exe = await installCloudflared();
    } catch (e) {
      console.log('[tunnel] Could not auto-install cloudflared:', e.message);
      console.log('[tunnel] Players on this network can still use the LAN QR codes.');
      return;
    }
  }

  console.log('[tunnel] Starting Cloudflare Tunnel -> localhost:' + PORT);
  const tunnel = spawn(exe, ['tunnel', '--url', `http://localhost:${PORT}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  const printUrl = (line) => {
    const m = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) {
      console.log(`\n=== PUBLIC URL (any network): ${m[0]} ===`);
      console.log(`Host game:    ${m[0]}/Game/TankDuel`);
      console.log(`Controller 1: ${m[0]}/Game/TankDuel/1`);
      console.log(`Controller 2: ${m[0]}/Game/TankDuel/2\n`);
    }
  };

  tunnel.stdout.on('data', (d) => {
    const s = d.toString();
    process.stdout.write(s);
    s.split('\n').forEach(printUrl);
  });
  tunnel.stderr.on('data', (d) => {
    const s = d.toString();
    process.stderr.write(s);
    s.split('\n').forEach(printUrl);
  });

  tunnel.on('exit', (code) => {
    console.log('[tunnel] cloudflared exited with code', code);
  });
}

server.on('exit', (code) => process.exit(code));
startTunnel();

process.on('SIGINT', () => {
  server.kill();
  process.exit(0);
});
