import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { socket } from '../socket.js';
import GameCanvas from './GameCanvas.jsx';

const GAME_NAME = 'TickTackToe';

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

  useEffect(() => {
    socket.emit('join_game', {
      gameName,
      role: 'controller',
      controllerId: id,
    });

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
      socket.off('disconnect', onDisconnect);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
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
          {DPAD.map((b) => (
            <button
              key={b.id}
              className={`btn ${b.cls}`}
              {...bind(b.id)}
            >
              {b.label}
            </button>
          ))}
        </div>
        <div className="actions">
          {ACTIONS.map((b) => (
            <button
              key={b.id}
              className={`btn ${b.cls}`}
              {...bind(b.id)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
      <div className={`controller__status ${connected ? 'connected' : ''}`}>
        {connected ? 'Connected to host' : 'Reconnecting…'}
      </div>
    </div>
  );
}
