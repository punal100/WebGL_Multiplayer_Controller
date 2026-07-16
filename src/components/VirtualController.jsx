import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { socket } from '../socket.js';
import GameCanvas from './GameCanvas.jsx';
import BrandLogo from './BrandLogo.jsx';
import { getGameDef } from '../games.js';

const GAME_NAME = 'TankDuel';

// Friendly label shown under each button when the game declares an
// inputSchema (turn-based games). Falls back to the generic glyph.
const ACTION_HINTS = {
  up: 'Up', down: 'Down', left: 'Left', right: 'Right',
  place: 'Place', restart: 'Reset',
};

const DPAD = [
  { id: 'up', label: '▲', cls: 'up' },
  { id: 'left', label: '◀', cls: 'left' },
  { id: 'right', label: '▶', cls: 'right' },
  { id: 'down', label: '▼', cls: 'down' },
];

const ACTIONS = [
  { id: 'y', label: 'Y', cls: 'y' },
  { id: 'x', label: 'X', cls: 'x' },
  { id: 'b', label: 'B', cls: 'b' },
  { id: 'a', label: 'A', cls: 'a' },
];

// Default to vertical. Switch to horizontal when the device is clearly meant
// to be held sideways (phone in landscape) or when it's not a touch phone
// (PC/tablet), where a wide layout is far more usable. The user can still
// flip it manually with the orientation button.
function detectHorizontal() {
  if (typeof window === 'undefined') return false;
  const landscape = window.innerWidth > window.innerHeight;
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const smallTouch = touch && Math.min(window.innerWidth, window.innerHeight) < 600;
  if (smallTouch) return landscape; // phone: horizontal only when sideways
  return landscape || !touch; // PC/tablet: always horizontal
}

export default function VirtualController() {
  const { gameName = GAME_NAME, controllerId } = useParams();
  const id = String(controllerId);
  const [connected, setConnected] = useState(socket.connected);
  const [horizontal, setHorizontal] = useState(detectHorizontal);

  const gameDef = getGameDef(gameName);
  const schema = gameDef?.inputSchema || null;
  // Map a controller button to its human-readable action (e.g. A -> "Place").
  const hintFor = (buttonId) => {
    if (!schema) return null;
    const action = schema[buttonId];
    return action ? ACTION_HINTS[action] || action : null;
  };

  useEffect(() => {
    socket.emit('join_game', {
      gameName,
      role: 'controller',
      controllerId: id,
    });

    // Ask the host for the current state so the board renders immediately
    // (turn-based games like TicTacToe don't stream state continuously).
    const requestState = () => socket.emit('request_state');
    socket.on('connect', requestState);
    if (socket.connected) requestState();
    // Also re-request shortly after joining in case the host wasn't ready.
    const t = setTimeout(requestState, 400);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    setConnected(socket.connected);

    // Keep the layout in sync with the physical orientation (phones).
    const onResize = () => setHorizontal(detectHorizontal());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    return () => {
      socket.off('connect', onConnect);
      socket.off('connect', requestState);
      socket.off('disconnect', onDisconnect);
      clearTimeout(t);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      // Leave the room so this controller socket never lingers in a stale
      // game's room after navigating away (prevents cross-game state).
      socket.emit('leave_game', { gameName, controllerId: id });
    };
  }, [gameName, id]);

  const send = (button, state) => {
    socket.emit('controller_input', { gameName, controllerId: id, button, state });
  };

  const bind = (button) => ({
    onTouchStart: (e) => {
      e.preventDefault();
      send(button, 'down');
    },
    onTouchEnd: (e) => {
      e.preventDefault();
      send(button, 'up');
    },
    onTouchCancel: (e) => {
      e.preventDefault();
      send(button, 'up');
    },
  });

  const renderBtn = (b) => {
    const hint = hintFor(b.id);
    return (
      <button key={b.id} className={`btn ${b.cls}`} {...bind(b.id)}>
        <span className="btn__label">{b.label}</span>
        {hint && <span className="btn__hint">{hint}</span>}
      </button>
    );
  };

  return (
    <div className={`controller ${horizontal ? 'controller--horizontal' : 'controller--vertical'}`}>
      <div className="controller__header">
        {gameName} · Player {id}
        <button
          className="controller__orient"
          onClick={() => setHorizontal((h) => !h)}
          title="Toggle layout"
        >
          {horizontal ? '⟲ Vertical' : '⟳ Horizontal'}
        </button>
      </div>
      <div className="controller__view">
        <GameCanvas mode="client" socket={socket} gameName={gameName} />
      </div>
      <div className="controller__body">
        <div className="dpad">
          {DPAD.map(renderBtn)}
        </div>
        <div className="actions">
          {ACTIONS.map(renderBtn)}
        </div>
      </div>
      <div className={`controller__status ${connected ? 'connected' : ''}`}>
        {connected ? 'Connected to host' : 'Reconnecting…'}
      </div>
      <BrandLogo className="brand-logo--bottom" />
    </div>
  );
}
