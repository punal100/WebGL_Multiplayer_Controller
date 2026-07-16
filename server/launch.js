import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const PORT = process.env.PORT || 4567;

// Tracks the cloudflared child so we can tear it down on shutdown.
let tunnelProc = null;

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
  const ext = process.platform === 'win32' ? '.exe' : '';
  const local = path.join(os.homedir(), '.cloudflared', 'cloudflared' + ext);
  return fs.existsSync(local) ? local : null;
}

function installCloudflared() {
  const isWin = process.platform === 'win32';
  const asset = isWin ? 'cloudflared-windows-amd64.exe' : 'cloudflared-linux-amd64';
  const ext = isWin ? '.exe' : '';
  console.log(`[tunnel] cloudflared not found. Installing (${asset})...`);
  const dest = path.join(os.homedir(), '.cloudflared');
  fs.mkdirSync(dest, { recursive: true });
  const exe = path.join(dest, 'cloudflared' + ext);
  const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`;
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(exe);
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error('Download failed: ' + res.statusCode));
          return;
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            if (process.platform !== 'win32') {
              try {
                fs.chmodSync(exe, 0o755);
              } catch {
                /* best-effort; user can chmod manually */
              }
            }
            resolve(exe);
          });
        });
      })
      .on('error', reject);
  });
}

async function startTunnel() {
  // Allow running the plain server with no public tunnel (e.g. behind your own
  // ingress/reverse proxy). Set NO_TUNNEL=1 to skip cloudflared entirely.
  if (process.env.NO_TUNNEL === '1' || process.env.NO_TUNNEL === 'true') {
    console.log('[tunnel] NO_TUNNEL set — skipping Cloudflare Tunnel.');
    return;
  }

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
  let tunnel;
  try {
    tunnel = spawn(exe, ['tunnel', '--url', `http://localhost:${PORT}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
  } catch (e) {
    console.log('[tunnel] Could not start cloudflared:', e.message);
    console.log('[tunnel] Players on this network can still use the LAN QR codes.');
    return;
  }
  tunnelProc = tunnel;

  const printUrl = (line) => {
    const m = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) {
      console.log(`\n=== PUBLIC URL (any network): ${m[0]} ===`);
      console.log(`TankDuel:    ${m[0]}/Game/TankDuel`);
      console.log(`TicTacToe:   ${m[0]}/Game/TicTacToe`);
      console.log(`Controllers: ${m[0]}/Game/<game>/1  &  /2\n`);
    }
  };

  tunnel.on('error', (e) => {
    console.log('[tunnel] cloudflared error:', e.message);
    console.log('[tunnel] Players on this network can still use the LAN QR codes.');
  });

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

// Clean shutdown for both Ctrl+C (SIGINT) and `docker stop` (SIGTERM).
function shutdown() {
  if (tunnelProc) tunnelProc.kill();
  server.kill();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
