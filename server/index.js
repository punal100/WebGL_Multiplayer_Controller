import express from 'express';
import http from 'node:http';
import { Server } from 'socket.io';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLanIp } from './lanIp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4567;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const lanIp = getLanIp();
console.log(`\n=== WebGL Multiplayer Controller ===`);
console.log(`Local access:  http://localhost:${PORT}`);
console.log(`LAN access:    http://${lanIp}:${PORT}`);
console.log(`Controller 1:  http://${lanIp}:${PORT}/TickTackToe/1`);
console.log(`Controller 2:  http://${lanIp}:${PORT}/TickTackToe/2\n`);

// Expose LAN info to the frontend
app.get('/api/config', (req, res) => {
  const origin = getPublicOrigin(req);
  res.json({ lanIp, port: PORT, origin });
});

// Serve the built React app
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// Resolve the best externally-reachable origin.
// When behind a tunnel (cloudflared/ngrok) or reverse proxy, use the
// forwarded proto+host so QR codes point at the public URL automatically.
function getPublicOrigin(req) {
  const fwdHost = req.headers['x-forwarded-host'];
  const proto = req.headers['x-forwarded-proto'] || (fwdHost ? 'https' : 'http');
  if (fwdHost) {
    return `${proto}://${fwdHost.split(',')[0].trim()}`;
  }
  const host = req.headers.host;
  if (host && host !== `localhost:${PORT}` && !host.startsWith(`${lanIp}:`)) {
    // Already accessed via a public/LAN host header
    return `${proto}://${host}`;
  }
  return `http://${lanIp}:${PORT}`;
}

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Track connected controllers per room
const roomControllers = new Map(); // room -> Map(controllerId -> socketId)

// Authoritative game state per room, persisted on the server so it survives
// a main-page (host) reload. Seeded by the first host; updated by each host
// broadcast; sent back to a host that (re)joins.
const roomState = new Map(); // room -> serialized state snapshot

io.on('connection', (socket) => {
  socket.on('join_game', ({ gameName, role, controllerId }) => {
    const room = gameName || 'TickTackToe';
    socket.data.room = room;
    socket.data.role = role; // 'host' | 'controller'
    socket.data.controllerId = controllerId;
    socket.join(room);

    if (role === 'controller') {
      if (!roomControllers.has(room)) roomControllers.set(room, new Map());
      roomControllers.get(room).set(String(controllerId), socket.id);
      io.to(room).emit('controller_status', {
        controllerId,
        connected: true,
      });
    } else if (role === 'host') {
      // Tell host which controllers are already connected
      const existing = roomControllers.get(room);
      if (existing) {
        for (const id of existing.keys()) {
          socket.emit('controller_status', { controllerId: id, connected: true });
        }
      }
      // Resume the host from the persisted state so a reload doesn't reset
      // positions/rotations/score.
      const saved = roomState.get(room);
      if (saved) socket.emit('resume_state', saved);
    }
  });

  socket.on('controller_input', (payload) => {
    const room = socket.data.room || payload?.gameName || 'TickTackToe';
    // Relay only to the host of this room
    socket.to(room).emit('controller_input', payload);
  });

  // Host broadcasts authoritative game state; store it and forward to
  // everyone else in the room (the controllers) so all screens stay in sync.
  socket.on('game_state', (payload) => {
    const room = socket.data.room || payload?.gameName || 'TickTackToe';
    roomState.set(room, payload.state); // persist across host reloads
    socket.to(room).emit('game_state', payload.state);
  });

  // Host (or any client) requests a full reset of the room state.
  socket.on('reset_game', (payload) => {
    const room = socket.data.room || payload?.gameName || 'TickTackToe';
    roomState.delete(room);
    io.to(room).emit('game_reset', { gameName: room });
  });

  socket.on('disconnect', () => {
    const { room, role, controllerId } = socket.data;
    if (role === 'controller' && room) {
      const m = roomControllers.get(room);
      if (m) {
        m.delete(String(controllerId));
        // Tell host to release all keys for this controller
        socket.to(room).emit('controller_disconnected', { controllerId });
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
