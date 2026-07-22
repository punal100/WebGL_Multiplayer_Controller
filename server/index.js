import express from 'express';
import http from 'node:http';
import { Server } from 'socket.io';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLanIp } from './lanIp.js';
import { getGameDef } from '../src/games/registry.js';
import { step } from '../src/game/engine.js';

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
const roomInputModel = new Map();
const roomKeys = new Map();
const TICK_MS = 33;

function releaseRoom(room, socket) {
  if (!room) return;
  if (socket.data.role === 'host') {
    roomState.delete(room);
    roomInputModel.delete(room);
    roomKeys.delete(room);
  }
}

io.on('connection', (socket) => {
  socket.on('join_game', ({ gameName, role, controllerId }) => {
    const room = gameName || 'TankDuel';
    const gameDef = getGameDef(room);
    const inputModel = gameDef?.inputModel || 'keys';

    const prevRoom = socket.data.room;
    if (prevRoom && prevRoom !== room) {
      socket.leave(prevRoom);
      releaseRoom(prevRoom, socket);
    }

    socket.data.room = room;
    socket.data.role = role;
    socket.data.controllerId = controllerId;
    socket.join(room);

    if (role === 'controller') {
      if (!roomControllers.has(room)) roomControllers.set(room, new Map());
      roomControllers.get(room).set(String(controllerId), socket.id);
      io.to(room).emit('controller_status', { controllerId, connected: true });
    } else if (role === 'host') {
      roomInputModel.set(room, inputModel);
      if (!roomState.has(room)) {
        const engine = gameDef?.engine;
        if (engine?.createInitialState) {
          roomState.set(room, engine.createInitialState());
        }
      }
      const saved = roomState.get(room);
      if (saved) socket.emit('resume_state', saved);
      socket.emit('host_role', { authoritative: true });
    }
  });

  socket.on('controller_input', (payload) => {
    const room = socket.data.room;
    if (!room || !roomState.has(room)) return;
    const inputModel = roomInputModel.get(room) || 'keys';
    const state = roomState.get(room);

    if (inputModel === 'actions') {
      const gameDef = getGameDef(room);
      if (gameDef?.engine?.applyAction) {
        const next = gameDef.engine.applyAction(state, String(payload.controllerId), payload.button);
        if (next !== state) {
          roomState.set(room, next);
          io.to(room).emit('game_state', gameDef.engine.serialize(next));
        }
      }
    } else {
      const cid = String(payload.controllerId);
      if (!roomKeys.has(room)) roomKeys.set(room, new Map());
      const controllerKeys = roomKeys.get(room);
      if (!controllerKeys.has(cid)) controllerKeys.set(cid, new Set());
      const keys = controllerKeys.get(cid);
      if (payload.state === 'down') keys.add(payload.button);
      else keys.delete(payload.button);
    }
  });

  socket.on('host_key', (payload) => {
    const room = socket.data.room;
    if (!room || !roomState.has(room)) return;
    const inputModel = roomInputModel.get(room) || 'keys';
    if (inputModel !== 'keys') return;
    if (!roomKeys.has(room)) roomKeys.set(room, new Map());
    const hostKeys = roomKeys.get(room);
    const hostId = 'host';
    if (!hostKeys.has(hostId)) hostKeys.set(hostId, new Set());
    const keys = hostKeys.get(hostId);
    if (payload.state === 'down') keys.add(payload.key);
    else keys.delete(payload.key);
  });

  socket.on('request_state', () => {
    const room = socket.data.room;
    if (!room) return;
    const snap = roomState.get(room);
    if (snap) {
      const gameDef = getGameDef(room);
      const serialized = gameDef?.engine?.serialize ? gameDef.engine.serialize(snap) : snap;
      socket.emit('game_state', serialized);
    }
  });

  socket.on('reset_game', () => {
    const room = socket.data.room;
    if (!room) return;
    const gameDef = getGameDef(room);
    if (gameDef?.engine?.createInitialState) {
      roomState.set(room, gameDef.engine.createInitialState());
      roomKeys.delete(room);
      io.to(room).emit('game_reset', { gameName: room });
    }
  });

  socket.on('leave_game', () => {
    const { room } = socket.data;
    if (!room) return;
    socket.leave(room);
    releaseRoom(room, socket);
    socket.data.room = null;
  });

  socket.on('disconnect', () => {
    const { room, role } = socket.data;
    if (role === 'controller' && room) {
      const cid = String(socket.data.controllerId);
      const m = roomControllers.get(room);
      if (m) {
        m.delete(cid);
        socket.to(room).emit('controller_disconnected', { controllerId: cid });
      }
      const ck = roomKeys.get(room);
      if (ck) ck.delete(cid);
    } else if (role === 'host' && room) {
      releaseRoom(room, socket);
    }
  });
});

setInterval(() => {
  for (const [room, state] of roomState) {
    const inputModel = roomInputModel.get(room) || 'keys';
    const gameDef = getGameDef(room);

    if (inputModel === 'actions') {
      continue;
    }

    const keys = new Set();
    const controllerKeys = roomKeys.get(room);
    if (controllerKeys) {
      for (const set of controllerKeys.values()) {
        for (const k of set) keys.add(k);
      }
    }
    step(state, keys, TICK_MS);
    roomState.set(room, state);
    const serialized = gameDef?.engine?.serialize ? gameDef.engine.serialize(state) : state;
    io.to(room).emit('game_state', serialized);
  }
}, TICK_MS);

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
