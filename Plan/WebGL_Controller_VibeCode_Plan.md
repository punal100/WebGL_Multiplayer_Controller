# **Vibe-Coding Project Plan: WebGL Local Multiplayer**

6-Hour Execution Roadmap | Node.js + React.js + Socket.io

This document is structured as a chronological prompt roadmap. You can feed these specific module breakdowns directly into your AI coding agent (e.g., KiloCode, Copilot, or Claude) to strictly control the context window and ensure the agent generates perfectly scoped components.

## **System Architecture Overview**

The system relies on a monolithic local development environment acting as the host machine.

- **Backend (Node.js + Express + Socket.io):** Serves the React static files, manages WebSockets for low-latency input relay, and dynamically determines the local IPv4 address for QR generation.

- **Frontend - Game Display (React.js):** Renders the WebGL game (via canvas or iframe). Connects to the backend via Socket.io. Listens for controller inputs and maps them directly to synthetic DOM <mark>`KeyboardEvent`</mark> dispatches. Displays QR codes for Controller 1 and 2.

- **Frontend - Virtual Controller (React.js):** Mobile-first UI hosted at <mark>`/:gameName/:controllerId`</mark> . Renders D-Pad and Action buttons. Captures <mark>`touchstart`</mark> and <mark>`touchend`</mark> to prevent default browser zooming/scrolling and emits Socket.io events.

## **Execution Roadmap (6 Hours)**

### **Phase 1: Monorepo & Backend Foundation**

**Hour 1**

**Objective:** Scaffold the project and establish the real-time relay server.

#### **AI Prompt / Task Directive:**

- Initialize a single directory with a Node.js Express backend and a Vite React frontend (served from backend static folder).

- Implement an Express server on port <mark>`4567` .</mark> Include a utility to find and log the machine's local LAN IP (e.g., <mark>`192.168.x.x` )</mark> .

- Integrate <mark>`socket.io` .</mark> Create rooms for specific games (e.g., room <mark>`TickTackToe` )</mark> .

-

- Create socket event listeners for: <mark>`join_game` ,</mark> <mark>`controller_input`</mark> .

-

- When <mark>`controller_input`</mark> is received from a mobile client, broadcast it immediately to the host display in that game's room.

**Hour 2**

### **Phase 2: Main Display & QR Code UI**

**Objective:** Build the host screen that houses the game and entry points.

#### **AI Prompt / Task Directive:**

- Create a React component <mark>`MainDisplay.jsx` .</mark> Layout: CSS Grid or Flexbox. Center area takes up 60-70% of the screen for the Game Container. Left and Right panels take up 15-20% each.

- Fetch the local IP from the backend upon mount.

-

- Use the <mark>`qrcode.react`</mark> package to generate two QR codes. Left QR points to <mark>`http:// [LOCAL_IP]:4567/TickTackToe/1` .</mark> Right QR points to <mark>`http://[LOCAL_IP]:4567/ TickTackToe/2` .</mark>

- Connect to Socket.io on mount. Register as the "host" for game <mark>`TickTackToe`</mark> .

-

- Add UI styling allowing PC mouse/keyboard interaction for a settings overlay.

-

### **Phase 3: Virtual Controller UI & Input Capture Hour 3 & 4**

**Objective:** Develop the mobile controller page that users access via QR scan.

#### **AI Prompt / Task Directive:**

- Implement React Router. Create route <mark>`/:gameName/:controllerId`</mark> routing to a <mark>`VirtualController.jsx`</mark> component.

- **Critical UI/UX:** Must use CSS to force fullscreen, disable text selection, and <mark>`touch-action: none;`</mark> to prevent mobile browser scrolling/pull-to-refresh.

- Layout: Left side D-Pad (Up, Down, Left, Right). Right side Action Buttons (A, B, X, Y or 1, 2, 3, 4).

- Event Handling: Do not use <mark>`onClick` .</mark> Use <mark>`onTouchStart`</mark> and <mark>`onTouchEnd` .</mark>

- Socket Emission: On touch start, emit <mark>`controller_input`</mark> with payload: <mark>`{ gameName, controllerId, button: 'W', state: 'down' }` .</mark> On touch end, emit state <mark>`up` .</mark>

**Hour 5**

### **Phase 4: Game Integration & Synthetic Events**

**Objective:** Map websocket payloads to standard browser keyboard events so the WebGL game functions without knowing about the controllers.

#### **AI Prompt / Task Directive:**

- In <mark>`MainDisplay.jsx` ,</mark> create a socket listener for <mark>`controller_input`</mark> .

-

- Create a mapping dictionary. E.g., Controller 1 'Up' -> `W` . Controller 2 'Up' -> <mark>`ArrowUp` .</mark>

-

- Write a function <mark>`dispatchSyntheticKey(key, isDown)`</mark> that creates and dispatches a <mark>`KeyboardEvent` .</mark>

```
const event = new KeyboardEvent(isDown ? 'keydown' : 'keyup', {
    key: key,
    code: `Key${key.toUpperCase()}`,
    bubbles: true
});
window.dispatchEvent(event);
```

```
// Note: If using an iframe for the WebGL game, dispatch to iframeRef.current.contentWindow
```

- Embed a simple 2-player WebGL/HTML5 game (either an existing open-source game or prompt the AI to generate a quick Canvas-based Pong/Tank game) inside the Game Container.

### **Phase 5: Polish & Latency Tuning**

**Hour 6**

**Objective:** Ensure smooth gameplay and robust state management.

#### **AI Prompt / Task Directive:**

- Implement connection state indicators on the Main Display (e.g., "P1 Connected", "P2 Disconnected").

- Handle edge cases: If a user closes their phone browser, trigger a <mark>`keyup`</mark> for all their currently pressed buttons so characters don't infinitely walk in one direction.

- Optimize static asset serving and Vite build process so a simple <mark>`npm run start`</mark> spins up both the Node server and serves the compiled React app seamlessly on port 4567.

**Vibe-Coding Strategy:** Because you are feeding this into an AI, generate the backend relay and the synthetic event dispatcher first (Phases 1 & 4). Once the core event loop (Socket -> KeyboardEvent) is verified in the browser console, the UI/WebGL implementations (Phases 2 & 3) will snap into place cleanly.
