import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { socket } from '../socket.js';
import GameCanvas from './GameCanvas.jsx';
import BrandLogo from './BrandLogo.jsx';
import { getGameDef } from '../games.js';
import { BUTTON_META } from '../inputMap.js';

const GAME_NAME = 'TankDuel';

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

const abilityHint = (buttonId) => BUTTON_META[buttonId]?.hint || null;

function detectHorizontal() {
  if (typeof window === 'undefined') return false;
  const landscape = window.innerWidth > window.innerHeight;
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const smallTouch = touch && Math.min(window.innerWidth, window.innerHeight) < 600;
  if (smallTouch) return landscape;
  return landscape || !touch;
}

export default function VirtualController() {
  const { gameName = GAME_NAME, controllerId } = useParams();
  const id = String(controllerId);
  const [connected, setConnected] = useState(socket.connected);
  const [horizontal, setHorizontal] = useState(detectHorizontal);

  const gameDef = getGameDef(gameName);
  const schema = gameDef?.inputSchema || null;
  const hintFor = (buttonId) => {
    if (!schema) return abilityHint(buttonId);
    const action = schema[buttonId];
    return action ? ACTION_HINTS[action] || action : null;
  };

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
    setConnected((c) => (c === socket.connected ? c : socket.connected));

    const onResize = () => setHorizontal(detectHorizontal());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      clearTimeout();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
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
        <GameCanvas socket={socket} gameName={gameName} />
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
