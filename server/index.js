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
console.log(`TankDuel host:  http://${lanIp}:${PORT}/Game/TankDuel`);
console.log(`  Controllers: http://${lanIp}:${PORT}/Game/TankDuel/1  &  /2`);
console.log(`TicTacToe host: http://${lanIp}:${PORT}/Game/TicTacToe`);
console.log(`  Controllers: http://${lanIp}:${PORT}/Game/TicTacToe/1  &  /2\n`);

app.get('/api/config', (req, res) => {
  const origin = getPublicOrigin(req);
  res.json({ lanIp, port: PORT, origin });
});

const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

function getPublicOrigin(req) {
  const fwdHost = req.headers['x-forwarded-host'];
  const proto = req.headers['x-forwarded-proto'] || (fwdHost ? 'https' : 'http');
  if (fwdHost) {
    return `${proto}://${fwdHost.split(',')[0].trim()}`;
  }
  const host = req.headers.host;
  if (host && host !== `localhost:${PORT}` && !host.startsWith(`${lanIp}:`)) {
    return `${proto}://${host}`;
  }
  return `http://${lanIp}:${PORT}`;
}

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const roomControllers = new Map();
const roomState = new Map();
const roomHost = new Map();
const roomHostLastBeat = new Map();
const HOST_BEAT_TIMEOUT_MS = 3500;

function releaseHostSlot(room, socket) {
  if (
    room &&
    socket.data.role === 'host' &&
    socket.data.authoritative &&
    roomHost.get(room) === socket.id
  ) {
    roomHost.delete(room);
    roomHostLastBeat.delete(room);
  }
}

io.on('connection', (socket) => {
  socket.on('reserve_host', () => {
    const room = socket.data.room;
    if (!room || socket.data.role !== 'host') return;
    roomHostLastBeat.set(room, Date.now());
  });

  socket.on('join_game', ({ gameName, role, controllerId }) => {
    const room = gameName || 'TankDuel';

    const prevRoom = socket.data.room;
    if (prevRoom && prevRoom !== room) {
      socket.leave(prevRoom);
      releaseHostSlot(prevRoom, socket);
    }

    socket.data.room = room;
    socket.data.role = role;
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
      roomHost.delete(room);
      const isAuthoritative = !roomHost.has(room);
      if (isAuthoritative) roomHost.set(room, socket.id);
      socket.data.authoritative = isAuthoritative;

      const existing = roomControllers.get(room);
      if (existing) {
        for (const id of existing.keys()) {
          socket.emit('controller_status', { controllerId: id, connected: true });
        }
      }
      const saved = roomState.get(room);
      if (saved) socket.emit('resume_state', saved);

      socket.emit('host_role', { authoritative: isAuthoritative });
    }
  });

  socket.on('controller_input', (payload) => {
    const room = socket.data.room;
    if (!room) return;
    socket.to(room).emit('controller_input', payload);
  });

  socket.on('request_state', () => {
    const room = socket.data.room;
    if (!room) return;
    const hostId = roomHost.get(room);
    if (hostId && hostId !== socket.id) {
      io.to(hostId).emit('request_state', { from: socket.id });
    }
  });

  socket.on('host_key', (payload) => {
    const room = socket.data.room;
    if (!room) return;
    const hostId = roomHost.get(room);
    if (hostId && hostId !== socket.id) {
      io.to(hostId).emit('host_key', payload);
    }
  });

  socket.on('game_state', (payload) => {
    const room = socket.data.room;
    if (!room) return;
    if (socket.data.authoritative && roomHost.get(room) === socket.id) {
      roomState.set(room, payload.state);
      socket.to(room).emit('game_state', payload.state);
    }
  });

  socket.on('reset_game', () => {
    const room = socket.data.room;
    if (!room) return;
    const hostId = roomHost.get(room);
    if (!hostId) return;
    roomState.delete(room);
    io.to(room).emit('game_reset', { gameName: room });
  });

  socket.on('leave_game', () => {
    const { room } = socket.data;
    if (!room) return;
    socket.leave(room);
    releaseHostSlot(room, socket);
    socket.data.room = null;
  });

  socket.on('disconnect', () => {
    const { room, role, controllerId } = socket.data;
    if (role === 'controller' && room) {
      const m = roomControllers.get(room);
      if (m) {
        m.delete(String(controllerId));
        socket.to(room).emit('controller_disconnected', { controllerId });
      }
    } else if (role === 'host' && room) {
      releaseHostSlot(room, socket);
    }
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [room, hostId] of roomHost) {
    const last = roomHostLastBeat.get(room);
    if (!last || now - last > HOST_BEAT_TIMEOUT_MS) {
      roomHostLastBeat.delete(room);
      const prev = roomHost.get(room);
      if (prev !== hostId) continue;
      roomHost.delete(room);
      io.to(room).emit('host_timeout');
    }
  }
}, 750);

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
