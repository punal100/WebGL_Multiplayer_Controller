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

| Button | Player 1 | Player 2     |
| ------ | -------- | ------------ |
| Up     | `W`      | `ArrowUp`    |
| Down   | `S`      | `ArrowDown`  |
| Left   | `A`      | `ArrowLeft`  |
| Right  | `D`      | `ArrowRight` |
| A      | `Q`      | `,`          |
| B      | `E`      | `.`          |
| X      | `R`      | `/`          |
| Y      | `F`      | `'`          |

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
> distribution builds and running on a VM or in containers. Want to **build the
> image on your PC and run it on a remote VM/Docker VM** instead? See
> **[Build Image on Your PC, Run on a Remote Docker / VM](#build-image-on-your-pc-run-on-a-remote-docker--vm)**.

---

## Scripts

| Command                | Description                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `npm run dev`          | Vite dev server with proxy to the backend (hot reload).                                     |
| `npm run build`        | Build the React app into `dist/`.                                                           |
| `npm run server`       | Run the Express + Socket.io server (no tunnel).                                             |
| `npm run serve`        | Run the server **+** auto Cloudflare Tunnel (no rebuild — for a packed/distribution build). |
| `npm run start`        | `build` then server + tunnel — one command to go live locally.                              |
| `npm run pack`         | Build + bundle a single shippable `.tar.gz` in `release/`.                                  |
| `npm run docker:build` | Build the production Docker image.                                                          |
| `npm run docker:run`   | Run the built image (maps port 4567).                                                       |
| `npm run docker:up`    | Build + run via Docker Compose (detached).                                                  |

---

## Running the Server (nohup) & Managing It

The app listens on **port `4567`** (override with `PORT`). Start it detached
(so it survives SSH/logout) with:

```bash
cd /root/webgl-mp && nohup env NODE_ENV=production NO_TUNNEL=1 npm run server > /root/server.log 2>&1 & disown
```

- `> /root/server.log 2>&1` — all output goes to the log file.
- `& disown` — detach from the shell so it keeps running after you disconnect.
- `NODE_ENV=production` and `NO_TUNNEL=1` — plain server, no auto Cloudflare Tunnel.

Follow logs: `tail -f /root/server.log`
Verify: `curl -s http://localhost:4567/ | head -c 200`

### Stopping / restarting (disown strips job control, so use these)

**By port (simplest, single command):**

```bash
fuser -k 4567/tcp
```

**By process search (if you don't know the port):**

```bash
pgrep -a node                 # find the PID + script path
kill <PID>                    # terminate it
```

Restart by re-running the `nohup … & disown` start line after stopping.

> If `curl` returns empty while a previous run printed `Server listening`,
> a stale process is holding the port (`EADDRINUSE`): `pkill -f 'server/index.js'`
> then restart.

### Better alternative: PM2 (recommended for production)

`nohup`/`disown` makes process management fragile. Use a process manager instead:

```bash
npm install -g pm2

# Start (env vars go BEFORE the pm2 command, never after --)
NODE_ENV=production NO_TUNNEL=1 pm2 start server/index.js --name "webgl-mp"

pm2 stop webgl-mp       # clean stop anytime
pm2 restart webgl-mp    # restart
pm2 logs webgl-mp       # follow logs
pm2 startup             # auto-start on reboot (then run the printed command)
pm2 save                # persist the current process list
```

> Env vars must be set **before** `pm2 start`, not after `--` (anything after
> `--` is treated as the app's own args / an ecosystem file path). For a
> persistent config, create `ecosystem.config.js`:
>
> ```js
> module.exports = {
>   apps: [{
>     name: "webgl-mp",
>     script: "server/index.js",
>     env_production: { NODE_ENV: "production", NO_TUNNEL: "1" }
>   }]
> };
> ```
>
> then: `pm2 start ecosystem.config.js --env production`.

---

## Production / Shipping Deployment

This section explains how to take a **distribution build** and run it in a
**shipping (production) environment**, on a **Virtual Machine** and inside
**containers**.

### 1. Environment Variables

The server reads the following variables (all optional, with sane defaults):

| Variable   | Default   | Description                                   |
| ---------- | --------- | --------------------------------------------- |
| `PORT`     | `4567`    | TCP port the server listens on.               |
| `NODE_ENV` | _(unset)_ | Set to `production` in shipping environments. |

> The server also honors `X-Forwarded-Host` / `X-Forwarded-Proto` headers, so
> it produces correct public QR-code URLs when placed behind a reverse proxy,
> load balancer, or tunnel.

---

### 2. Take a Distribution Build (one command)

Just like `npm run start` runs everything out of the box locally, **`npm run
pack` produces a complete, shippable build in one command**:

```bash
npm ci        # once, to install build tools
npm run pack
```

This runs the frontend build **and** bundles everything the runtime needs into a
single archive:

```
release/webgl-multiplayer-controller-<version>.tar.gz
```

The archive contains only the runtime files — `dist/` (compiled frontend),
`server/`, `public/`, and `package*.json`. Source files, `node_modules/`, and
the Vite config are left out. **One file to copy, nothing to assemble by hand.**

> `npm run pack` is cross-platform (Windows / Linux / macOS) — it uses the
> built-in `tar` available on Windows 10+ and every Unix.

---

### 3. Run in a Shipping Environment — Virtual Machine

The whole flow is: **pack once → copy one file → extract → run.**

#### 3.1 On your machine — build the artifact

```bash
npm run pack
# -> release/webgl-multiplayer-controller-1.0.0.tar.gz
```

#### 3.2 Provision the VM (fresh Ubuntu/Debian)

```bash
# Install Node.js 18+ (20 LTS recommended)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# App directory
sudo mkdir -p /opt/webgl-mp-controller
sudo chown "$USER" /opt/webgl-mp-controller
```

#### 3.3 Copy the one archive to the VM

Use `scp` from **your machine** (replace user/IP). This is the whole "copy to
the VM" step — a single file:

```bash
scp release/webgl-multiplayer-controller-1.0.0.tar.gz \
    user@<VM_IP>:/opt/webgl-mp-controller/
```

> No `scp`? Any transfer works — `rsync`, an SFTP client (WinSCP/FileZilla), a
> cloud bucket, or your CI's artifact upload. It's just one file.

#### 3.4 Extract, install, run (on the VM)

```bash
cd /opt/webgl-mp-controller
tar -xzf webgl-multiplayer-controller-1.0.0.tar.gz   # unpack the one file

npm ci --omit=dev        # install ONLY production deps (no vite/react)
sudo ufw allow 4567/tcp  # open the firewall port

# Go live:
NODE_ENV=production npm run server      # plain server (no tunnel)
# or, to also auto-start a public Cloudflare Tunnel:
NODE_ENV=production npm run serve
```

Then reach the host at `http://<VM_IP>:4567/`.

> `npm run server` = plain server. `npm run serve` = server **+** auto Cloudflare
> Tunnel (no rebuild — safe for a distribution build). Do **not** use `npm run
start` on a packed build: it re-runs `npm run build`, which needs the source
> tree and dev tooling that a distribution build intentionally omits.
> The bundled tunnel auto-installer downloads the Windows binary; on
> Linux install `cloudflared` from your package manager first so it's on `PATH`.

#### 3.5 Keep it running across reboots (systemd)

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

---

### 4. Run in a Shipping Environment — Containers

A ready-to-use `Dockerfile`, `.dockerignore`, and `docker-compose.yml` are
**already included** in the repo. You don't build the artifact separately — the
image build does `npm run build` inside a multi-stage build for you.

#### 4.1 Docker — one command to build, one to run

```bash
npm run docker:build     # docker build -t webgl-mp-controller:latest .
npm run docker:run       # runs detached, maps host:container 4567

docker logs -f webgl-mp  # follow logs (shows the public tunnel URL)
```

Open `http://<DOCKER_HOST_IP>:4567/`.

The image runs `server/launch.js`, so — just like `npm run start` — it starts
the server **and** an auto Cloudflare Tunnel (`cloudflared` is baked into the
image). The public `https://<random>.trycloudflare.com` URL is printed in the
logs. To run the **plain server** instead (e.g. behind your own ingress/reverse
proxy), set `NO_TUNNEL=1`:

```bash
docker run -d --name webgl-mp -p 4567:4567 -e NO_TUNNEL=1 webgl-mp-controller:latest
```

#### 4.2 Docker Compose — single command, out of the box

```bash
npm run docker:up        # docker compose up -d --build
docker compose logs -f
```

Stop it with `docker compose down`. (Add `NO_TUNNEL=1` to the compose
`environment:` block to disable the tunnel.)

#### 4.3 Building the container _from the packed artifact_ (optional)

If you'd rather build an image on a machine that only has the shipped
`.tar.gz` (no source tree), extract it and build a tiny runtime-only image.
Install `cloudflared` in the image if you want the auto tunnel; otherwise it
runs the plain server:

```bash
mkdir app && tar -xzf webgl-multiplayer-controller-1.0.0.tar.gz -C app
cd app

cat > Dockerfile <<'EOF'
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=4567
# cloudflared for the auto Cloudflare Tunnel (omit for plain-server only)
RUN apk add --no-cache wget ca-certificates \
    && wget -q -O /usr/local/bin/cloudflared \
       https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
    && chmod +x /usr/local/bin/cloudflared
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist ./dist
COPY server ./server
COPY public ./public
EXPOSE 4567
CMD ["node", "server/launch.js"]
EOF

docker build -t webgl-mp-controller:latest .
docker run -d --name webgl-mp -p 4567:4567 --restart unless-stopped webgl-mp-controller:latest
```

#### 4.4 Notes for containers & orchestrators

- **Tunnel vs. ingress:** The image starts a Cloudflare Tunnel by default. When
  you expose the app through your own ingress/reverse proxy or a load balancer,
  set `NO_TUNNEL=1` so you don't run a redundant public tunnel.
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

## Run on E2E via a Container Instance (TIR "Own Container")

E2E's **Instance with Your Own Container** flow
(<https://docs.e2enetworks.com/docs/tir/Nodes/Node_Own_Container/>) launches your
image **as the instance itself** — it is a container-native runtime, **not** a VM
with a Docker daemon inside it. You do **not** run `docker` commands inside the
instance. Instead, you push the image to the E2E Container Registry from your PC,
then select it when creating the instance; E2E boots it directly using the
image's `CMD` (`node server/launch.js`), so no start-command hacks are needed.

> If you specifically want to run `docker` commands yourself, use a real
> **E2E Virtual Machine** (MyAccount → VMs) and follow the VM flow in
> [§3](#3-run-in-a-shipping-environment--virtual-machine) — the container
> instance product has no Docker CLI installed.

### 1. Push the image to the E2E Container Registry (from your PC)

```bash
# Build for the correct architecture (E2E instances are linux/amd64)
docker build --platform linux/amd64 -t webgl-mp-controller:latest .

docker login registry.e2enetworks.net        # E2E registry credentials
docker tag  webgl-mp-controller:latest registry.e2enetworks.net/<namespace>/webgl-mp-controller:latest
docker push registry.e2enetworks.net/<namespace>/webgl-mp-controller:latest
```

Replace `<namespace>` with your E2E registry namespace (shown in the dashboard
under **Integrations → E2E Container Registry**).

### 2. Launch the instance from your image

In the TIR dashboard: **Create Instance → Custom Images → Private →** select your
namespace and the `webgl-mp-controller:latest` image, then launch. E2E runs the
image as the instance (no inner Docker). After it starts you can open **Jupyter
Lab** or **SSH** to inspect it, and reach the app at the instance's IP.

### 3. Access the app

- Expose / allow inbound **port `4567`** in the instance's security/firewall
  settings so phones can reach it.
- Open `http://<INSTANCE_IP>:4567/`.
- The server starts an auto Cloudflare Tunnel by default; set the environment
  variable **`NO_TUNNEL=1`** (instance env settings) to run the plain server when
  you expose it through your own ingress/reverse proxy.
### 4. No-Docker option: tarball + run directly on the instance

If you would rather not use the container registry / image path, the E2E
container instance is just a Linux host — you can run the app directly with
Node (no Docker needed). This reuses the distribution tarball from
[§2](#2-take-a-distribution-build-one-command).

**On your PC:**

```bash
npm run pack
# -> release/webgl-multiplayer-controller-1.0.0.tar.gz
```

Upload that one file to the instance (SCP, the JupyterLab upload UI, an SFTP
client, or a cloud bucket). Then **on the instance** (SSH or JupyterLab
terminal):

**Prerequisite — install Node.js 20 LTS** (the instance does not ship
`node` / `npm`):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v && npm -v
```

If `sudo` is unavailable or the instance is not Debian/Ubuntu, check
`cat /etc/os-release` and install Node 18+ for that distro.

**Run the app** (use the **absolute path** — on this instance `~` resolves
to `/home/jovyan`, which is empty; the files live under `/root`):

```bash
mkdir -p /root/webgl-mp && tar -xzf webgl-multiplayer-controller-1.0.0.tar.gz -C /root/webgl-mp
cd /root/webgl-mp
npm ci --omit=dev                 # install production deps only
NODE_ENV=production npm run serve # server + Cloudflare Tunnel (public URL)
# or, behind your own ingress/reverse proxy:
NODE_ENV=production NO_TUNNEL=1 npm run server
```

**Keep it running after you close SSH.** A plain foreground `npm run server`
dies when the SSH session ends. Start it detached and disowned (one line,
with the `cd` inside the same command so the working directory is correct):

```bash
cd /root/webgl-mp && nohup env NODE_ENV=production NO_TUNNEL=1 npm run server > /root/server.log 2>&1 & disown
```

Then disconnect SSH, reconnect, and verify it survived:

```bash
curl -s http://localhost:4567/ | head -c 200
ps aux | grep index.js | grep -v grep
```

> `tmux` / `setsid` were not available on this instance, and `~/webgl-mp`
> failed because `~` expanded to the empty `/home/jovyan`. The
> `cd /root/webgl-mp && nohup … & disown` form above is what
> actually works. If `disown` is unavailable, `nohup … &` alone usually
> survives logout too.

**Reaching the app.** Open `http://<INSTANCE_IP>:4567/`. Expose /
allow inbound **TCP port `4567`** in the instance's security group / firewall
(SSH on 22 works because it is already allowed; 4567 is not by default).
The server prints QR codes pointing at the instance's detected LAN IP; when you
open the host page from the instance's **public IP**, the on-screen QR codes
resolve to that public address and phones on any network can scan them.

> If `curl http://localhost:4567/` returns empty while a previous run printed
> `Server listening on port 4567`, you have a **stale process** holding the
> port (`EADDRINUSE`). Kill it first: `pkill -f 'server/index.js'`, then
> restart with the `nohup … & disown` line above.

**Cloudflare Tunnel on the instance.** `npm run serve` needs `cloudflared`
on `PATH`. The server tries to auto-install it (Linux:
`cloudflared-linux-amd64`; Windows: `cloudflared-windows-amd64.exe`) if missing,
and `chmod +x` the binary after download. If auto-install is blocked (e.g.
no outbound GitHub access), install it yourself before starting:

```bash
curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared
```

…then `NODE_ENV=production npm run serve` picks it up and prints the public
`https://…trycloudflare.com` URL. To skip the tunnel entirely and expose the
instance directly, use `NODE_ENV=production NO_TUNNEL=1 npm run server` and
open `http://<INSTANCE_PUBLIC_IP>:4567/`.

---

## Project Structure

```
WebGL_Multiplayer_Controller/
├── server/
│   ├── index.js       # Express + Socket.io relay server (port 4567)
│   ├── launch.js      # server + auto Cloudflare Tunnel (npm run serve / start)
│   └── lanIp.js       # Detects the machine's LAN IPv4 address
├── scripts/
│   └── pack.js        # Build + bundle one shippable .tar.gz (npm run pack)
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
├── Dockerfile           # Multi-stage production image
├── docker-compose.yml   # One-command container run
├── .dockerignore
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
- **For containerized deployment:** Docker (and optionally Docker Compose). Not
  required for the E2E container-instance tarball path (see
  [§4](#4-no-docker-option-tarball--run-directly-on-the-instance)), which runs
  the app directly with Node.

> Looking to deploy? See **[Production / Shipping Deployment](#production--shipping-deployment)**
> for distribution builds and running on a VM or in containers, or
> **[Run on E2E via a Container Instance (TIR "Own Container")](#run-on-e2e-via-a-container-instance-tir-own-container)**
> to deploy on E2E Networks.
