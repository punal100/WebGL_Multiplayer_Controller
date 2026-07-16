# WebGL Multiplayer Controller

Turn any phone into a wireless game controller. This project hosts a **two-player WebGL game** in a browser on your PC and lets two players control it from their phones by scanning QR codes — no app install, just a webpage.

Built with a 6-hour vibe-coding roadmap (Node.js + Express + React + Socket.io). Works on **local LAN** and, out of the box, over the **public internet** via an auto-started Cloudflare Tunnel.

---

## How It Works

```
┌──────────────┐     QR scan      ┌──────────────────────┐
│  Phone P1    │ ───────────────▶ │  http://LAN:4567/    │
│  (controller)│    touch events  │   TickTackToe/1      │
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
3. Players scan the QR to open a virtual controller page at `/TickTackToe/<id>`.
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

- **Host (PC):** `http://localhost:4567` or `http://<LAN_IP>:4567`
- **Controllers (phones):** scan the on-screen QR codes, or visit:
  - Player 1: `http://<LAN_IP>:4567/TickTackToe/1`
  - Player 2: `http://<LAN_IP>:4567/TickTackToe/2`

The server prints the LAN IP on startup, e.g.:

```
LAN access:    http://192.168.1.8:4567
Controller 1:  http://192.168.1.8:4567/TickTackToe/1
Controller 2:  http://192.168.1.8:4567/TickTackToe/2
```

> **Note:** Phones must be on the **same Wi-Fi/network** as the host PC to reach the LAN IP.

---

## Scripts

| Command           | Description                                              |
|-------------------|----------------------------------------------------------|
| `npm run dev`     | Vite dev server with proxy to the backend (hot reload). |
| `npm run build`   | Build the React app into `dist/`.                        |
| `npm run server`  | Run the Express + Socket.io server.                      |
| `npm run start`   | `build` then `server` — one command to go live.          |

---

## Project Structure

```
WebGL_Multiplayer_Controller/
├── server/
│   ├── index.js       # Express + Socket.io relay server (port 4567)
│   └── lanIp.js       # Detects the machine's LAN IPv4 address
├── src/
│   ├── main.jsx       # React entry + router
│   ├── socket.js      # Shared Socket.io client
│   ├── inputMap.js    # Key mapping + synthetic KeyboardEvent dispatch
│   ├── components/
│   │   ├── MainDisplay.jsx     # Host screen: QR codes, game, status
│   │   ├── VirtualController.jsx # Mobile controller page
│   │   └── GameCanvas.jsx      # Embedded 2-player WebGL/Canvas game
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
- **PC settings overlay** — mouse/keyboard accessible for host config.
- **Mobile-hardened UI** — `touch-action: none`, no scroll/zoom, fullscreen layout.

---

## Requirements

- Node.js 18+ (developed on Node 25)
- A local network shared between the host PC and player phones
