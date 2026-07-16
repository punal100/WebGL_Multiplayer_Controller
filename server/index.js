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
console.log(`Pick a game:   http://${lanIp}:${PORT}/`);
console.log(`Host TickTackToe: http://${lanIp}:${PORT}/Game/TickTackToe`);
console.log(`Controller 1:  http://${lanIp}:${PORT}/Game/TickTackToe/1`);
console.log(`Controller 2:  http://${lanIp}:${PORT}/Game/TickTackToe/2\n`);

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

// There must be EXACTLY ONE simulator of the authoritative state per room.
// Multiple main windows are allowed, but only the first (authoritative) host
// simulates and broadcasts. Extra main windows join as "viewer" windows that
// merely render the authoritative state. Without this, two independently
// simulating hosts would broadcast two different sets of character data and
// connected controllers would flicker between the two.
const roomHost = new Map(); // room -> socketId of the authoritative host

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
      // Exactly one authoritative host per room simulates and broadcasts the
      // single source-of-truth state. The first host to join owns it; any
      // additional main windows become viewers that just render.
      const isAuthoritative = !roomHost.has(room);
      if (isAuthoritative) roomHost.set(room, socket.id);
      socket.data.authoritative = isAuthoritative;

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

      // Inform this window whether it should simulate or merely view.
      socket.emit('host_role', { authoritative: isAuthoritative });
    }
  });

  socket.on('controller_input', (payload) => {
    const room = socket.data.room || payload?.gameName || 'TickTackToe';
    // Relay only to the host of this room
    socket.to(room).emit('controller_input', payload);
  });

  // A non-authoritative (viewer) main window relays its own local keyboard
  // presses to the single authoritative host so input works in ANY main
  // window while still keeping one source of truth.
  socket.on('host_key', (payload) => {
    const room = socket.data.room || payload?.gameName || 'TickTackToe';
    const hostId = roomHost.get(room);
    if (hostId && hostId !== socket.id) {
      io.to(hostId).emit('host_key', payload);
    }
  });

  // Host broadcasts authoritative game state; store it and forward to
  // everyone else in the room (the controllers) so all screens stay in sync.
  // Only the authoritative host's state is accepted — a viewer window must
  // never overwrite the single source of truth with its own inert copy.
  socket.on('game_state', (payload) => {
    const room = socket.data.room || payload?.gameName || 'TickTackToe';
    if (socket.data.authoritative && roomHost.get(room) === socket.id) {
      roomState.set(room, payload.state); // persist across host reloads
      socket.to(room).emit('game_state', payload.state);
    }
  });

  // Host (or any client) requests a full reset of the room state. Only the
  // authoritative host may reset the single source of truth.
  socket.on('reset_game', (payload) => {
    const room = socket.data.room || payload?.gameName || 'TickTackToe';
    if (!socket.data.authoritative || roomHost.get(room) !== socket.id) return;
    roomState.delete(room);
    io.to(room).emit('game_reset', { gameName: room });
  });

  socket.on('disconnect', () => {
    const { room, role, controllerId, authoritative } = socket.data;
    if (role === 'controller' && room) {
      const m = roomControllers.get(room);
      if (m) {
        m.delete(String(controllerId));
        // Tell host to release all keys for this controller
        socket.to(room).emit('controller_disconnected', { controllerId });
      }
    } else if (role === 'host' && room) {
      // If the authoritative host left, release the slot so a surviving
      // viewer window can take over as the single simulator.
      if (authoritative && roomHost.get(room) === socket.id) {
        roomHost.delete(room);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
