# WebGL Multiplayer Controller

Turn any phone into a wireless game controller. This project hosts a **two-player WebGL game** in a browser on your PC and lets two players control it from their phones by scanning QR codes — no app install, just a webpage.

Built with a 6-hour vibe-coding roadmap (Node.js + Express + React + Socket.io). Works on **local LAN** and, out of the box, over the **public internet** via an auto-started Cloudflare Tunnel.

---

## How It Works

```
┌──────────────┐     QR scan      ┌──────────────────────┐
│  Phone P1    │ ───────────────▶ │  http://LAN:4567/    │
│  (controller)│    touch events  │   Game/TankDuel/1   │
└──────────────┘ ─── Socket.io ──▶┌──────────────────────┐
                                    │  Host PC (browser)  │
┌──────────────┐ ─── Socket.io ──▶│  - Game canvas      │
│  Phone P2    │ ───────────────▶ │  - QR codes (L/R)   │
│  (controller)│     QR scan      │  - Synthetic keys   │
└──────────────┘ ◀─────────────── │                      │
                                  └──────────────────────┘
```

1. The PC runs an Express + Socket.io server on port **4567** and serves the React app.
2. The host screen shows two **QR codes** (left = Player 1, right = Player 2).
3. Players scan the QR to open a virtual controller page at `/Game/TankDuel/<id>`.
4. Touching buttons emits Socket.io events that the host turns into **synthetic `KeyboardEvent`s**, so the game plays as if keys were pressed on the PC — no game code changes needed.

---

## Player Key Mapping

| Button | Player 1 | Player 2 |
|--------|----------|----------|
| Up     | `W`      | `ArrowUp` |
| Down   | `S`      | `ArrowDown` |
| Left   | `A`      | `ArrowLeft` |
| Right  | `D`      | `ArrowRight` |
| A      | `Q`      | `,` |
| B      | `E`      | `.` |
| X      | `R`      | `/` |
| Y      | `F`      | `'` |

---

## Quick Start

```bash
npm install
npm run start
```

`npm run start` builds the React frontend and launches the server. Then open:

- **Host (PC):** `http://localhost:4567/` (landing page) → pick a game, or open directly `http://localhost:4567/Game/TankDuel`
- **Controllers (phones):** scan the on-screen QR codes, or visit:
  - Player 1: `http://<LAN_IP>:4567/Game/TankDuel/1`
  - Player 2: `http://<LAN_IP>:4567/Game/TankDuel/2`

The server prints the LAN IP on startup, e.g.:

```
LAN access:    http://192.168.1.8:4567
Host game:     http://192.168.1.8:4567/Game/TankDuel
Controller 1:  http://192.168.1.8:4567/Game/TankDuel/1
Controller 2:  http://192.168.1.8:4567/Game/TankDuel/2
```

> **Note:** Phones must be on the **same Wi-Fi/network** as the host PC to reach the LAN IP.

> **Deploying to a server?** Skip the local flow and jump to
> **[Production / Shipping Deployment](#production--shipping-deployment)** for
> distribution builds and running on a VM or in containers.

---

## Scripts

| Command           | Description                                              |
|-------------------|----------------------------------------------------------|
| `npm run dev`     | Vite dev server with proxy to the backend (hot reload). |
| `npm run build`   | Build the React app into `dist/`.                        |
| `npm run server`  | Run the Express + Socket.io server.                      |
| `npm run start`   | `build` then `server` — one command to go live.          |

---

## Production / Shipping Deployment

This section explains how to take a **distribution build** and run it in a
**shipping (production) environment**, on a **Virtual Machine** and inside
**containers**.

### 1. Environment Variables

The server reads the following variables (all optional, with sane defaults):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `4567`  | TCP port the server listens on. |
| `NODE_ENV` | *(unset)* | Set to `production` in shipping environments. |

> The server also honors `X-Forwarded-Host` / `X-Forwarded-Proto` headers, so
> it produces correct public QR-code URLs when placed behind a reverse proxy,
> load balancer, or tunnel.

---

### 2. Take a Distribution Build

A distribution build compiles the React frontend into static assets in `dist/`.
The Node server then serves those static files plus the Socket.io relay.

```bash
# 1. Install ALL dependencies (build needs devDependencies like vite)
npm ci

# 2. Produce the optimized static frontend into dist/
npm run build
```

After this, the **shippable artifacts** are:

```
dist/            # compiled, minified frontend (static)
server/          # Express + Socket.io runtime
package.json     # runtime dependency manifest
package-lock.json
```

`node_modules/`, source files under `src/`, and the Vite config are **not**
required at runtime — only `dist/`, `server/`, and the production dependencies.

#### Optional: package a tarball to ship

```bash
# Create a clean, versioned artifact you can copy to any host
npm pack            # or:
tar -czf webgl-mp-controller.tgz dist server package.json package-lock.json public
```

Copy that archive to your VM / build the container from it.

---

### 3. Run in a Shipping Environment — Virtual Machine

These steps assume a fresh Linux VM (Ubuntu/Debian). Adjust package commands
for other distros.

#### 3.1 Provision the VM

```bash
# Install Node.js 18+ (20 LTS recommended)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Create a dedicated app directory
sudo mkdir -p /opt/webgl-mp-controller
sudo chown "$USER" /opt/webgl-mp-controller
```

#### 3.2 Deploy the build

```bash
# Copy your artifact (dist/, server/, package*.json, public/) onto the VM,
# e.g. via scp, then from inside /opt/webgl-mp-controller:
cd /opt/webgl-mp-controller

# Install ONLY production dependencies (no vite/react needed at runtime)
npm ci --omit=dev
```

#### 3.3 Open the firewall

```bash
# Allow inbound traffic on the app port (default 4567)
sudo ufw allow 4567/tcp
```

#### 3.4 Run it

Quick foreground run:

```bash
NODE_ENV=production PORT=4567 node server/index.js
```

> Use `node server/index.js` for a **plain server** (no tunnel).
> Use `node server/launch.js` if you also want the **auto Cloudflare Tunnel**
> (note: the bundled auto-installer downloads the Windows binary; on Linux
> install `cloudflared` via your package manager first so it's on `PATH`).

#### 3.5 Keep it running (systemd)

Create `/etc/systemd/system/webgl-mp.service`:

```ini
[Unit]
Description=WebGL Multiplayer Controller
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/webgl-mp-controller
Environment=NODE_ENV=production
Environment=PORT=4567
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3
User=www-data

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now webgl-mp
sudo systemctl status webgl-mp      # verify it is running
journalctl -u webgl-mp -f           # follow logs (shows LAN + tunnel URLs)
```

Then reach the host at `http://<VM_IP>:4567/`.

---

### 4. Run in a Shipping Environment — Containers

Containerizing gives you a reproducible, portable shipping artifact.

#### 4.1 `Dockerfile` (multi-stage)

Create a `Dockerfile` at the project root:

```dockerfile
# ---- Build stage: compile the frontend ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Runtime stage: slim production image ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4567

# Only production deps for the runtime
COPY package*.json ./
RUN npm ci --omit=dev

# Bring over the compiled frontend + server + static assets
COPY --from=build /app/dist ./dist
COPY server ./server
COPY public ./public

EXPOSE 4567
CMD ["node", "server/index.js"]
```

> The container runs the **plain server** (`server/index.js`), not the
> Cloudflare Tunnel launcher, which is the correct choice behind an ingress /
> reverse proxy. Expose the app publicly via your orchestrator's ingress
> instead.

#### 4.2 `.dockerignore`

Create a `.dockerignore` so the build context stays small:

```
node_modules
dist
.git
.vscode
.idea
*.log
Plan
.playwright-mcp
```

#### 4.3 Build and run with Docker

```bash
# Build the image
docker build -t webgl-mp-controller:latest .

# Run it, mapping the container port to the host
docker run -d --name webgl-mp -p 4567:4567 \
  -e NODE_ENV=production -e PORT=4567 \
  --restart unless-stopped \
  webgl-mp-controller:latest

# Follow logs
docker logs -f webgl-mp
```

Open `http://<DOCKER_HOST_IP>:4567/`.

#### 4.4 Docker Compose

Create `docker-compose.yml`:

```yaml
services:
  webgl-mp-controller:
    build: .
    image: webgl-mp-controller:latest
    ports:
      - "4567:4567"
    environment:
      - NODE_ENV=production
      - PORT=4567
    restart: unless-stopped
```

Run it:

```bash
docker compose up -d --build
docker compose logs -f
```

#### 4.5 Notes for containers & orchestrators

- **WebSockets:** Socket.io requires WebSocket upgrade support. If you front the
  container with Nginx/Traefik/ingress, enable WebSocket/`Upgrade` headers and
  disable buffering on `/socket.io`.
- **Sticky sessions:** If you scale to multiple replicas behind a load
  balancer, enable **sticky sessions** (session affinity) or a Socket.io
  adapter (e.g. Redis), because game rooms/state are held **in-memory** per
  server instance. A single replica needs no special config.
- **Health check:** `GET /api/config` returns JSON and is a good liveness/
  readiness probe target.
- **QR codes:** Set your public hostname via the reverse proxy so
  `X-Forwarded-Host`/`X-Forwarded-Proto` are passed through — the QR codes then
  point at the real public URL automatically.

---

## Project Structure

```
WebGL_Multiplayer_Controller/
├── server/
│   ├── index.js       # Express + Socket.io relay server (port 4567)
│   └── lanIp.js       # Detects the machine's LAN IPv4 address
├── src/
│   ├── main.jsx       # React entry + router (landing, /Game/:name, /Game/:name/:id)
│   ├── games.js       # Re-exports the game registry + DEFAULT_GAME
│   ├── games/
│   │   ├── registry.js  # Master registry: engine, renderer, input model per game
│   │   └── tictactoe/   # TicTacToe engine + renderer (turn-based, 'actions' input)
│   ├── game/            # Shared real-time engine (TankDuel: 'keys' input)
│   ├── socket.js      # Shared Socket.io client
│   ├── inputMap.js    # Key mapping + synthetic KeyboardEvent dispatch
│   ├── components/
│   │   ├── GameSelect.jsx     # Landing page: pick a game
│   │   ├── MainDisplay.jsx     # Host screen: QR codes, game, status
│   │   ├── VirtualController.jsx # Mobile controller page
│   │   └── GameCanvas.jsx      # Embedded game canvas (host/viewer/client)
│   └── styles/global.css
├── index.html
├── vite.config.js
└── package.json
```

---

## Features

- **Zero-install controllers** — phones control the game via a webpage.
- **Low-latency input** — Socket.io WebSocket relay, direct key synthesis.
- **Connection indicators** — host shows `P1 Connected` / `P2 Connected`.
- **Safe disconnect** — closing a phone releases all held keys (no stuck movement).
- **Multiple games at once** — each game runs in its own isolated Socket.io room, so inputs from one game never affect another, and several games can run concurrently.
- **PC settings overlay** — mouse/keyboard accessible for host config.
- **Mobile-hardened UI** — `touch-action: none`, no scroll/zoom, fullscreen layout.
- **Two games included** — `TankDuel` (real-time tank shooter, key-driven) and `TicTacToe` (turn-based 3×3 duel, action-driven). Both share the same controller/QR infrastructure.

---

## Adding a New Game

Games are data-driven via `src/games/registry.js`. To add one:

1. Create `src/games/<name>/engine.js` exporting `createInitialState`, `serialize`, and `applyAction(state, controllerId, action)` (plus optional `applyKeyAction` for host-keyboard play).
2. Create `src/games/<name>/render.js` exporting `renderState(ctx, canvas, state)` to draw a snapshot.
3. Register it in `registry.js` with `inputModel`:
   - `'keys'` — controller buttons become synthetic keyboard events (real-time games, e.g. TankDuel).
   - `'actions'` — controller buttons map to discrete game actions via `inputSchema` (turn-based games, e.g. TicTacToe).
4. It automatically appears on the landing page, gets isolated rooms, and QR codes — no other changes needed.

---

## Requirements

- Node.js 18+ (developed on Node 25) — 20 LTS recommended for shipping
- A local network shared between the host PC and player phones
- **For containerized deployment:** Docker (and optionally Docker Compose)

> Looking to deploy? See **[Production / Shipping Deployment](#production--shipping-deployment)**
> for distribution builds and running on a VM or in containers.
