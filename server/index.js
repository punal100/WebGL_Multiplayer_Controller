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
  res.json({ lanIp, port: PORT });
});

// Serve the built React app
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Track connected controllers per room
const roomControllers = new Map(); // room -> Map(controllerId -> socketId)

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
    }
  });

  socket.on('controller_input', (payload) => {
    const room = socket.data.room || payload?.gameName || 'TickTackToe';
    // Relay only to the host of this room
    socket.to(room).emit('controller_input', payload);
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
