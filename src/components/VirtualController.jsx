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

export default function VirtualController() {
  const { gameName = GAME_NAME, controllerId } = useParams();
  const id = String(controllerId);
  const [connected, setConnected] = useState(socket.connected);

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

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
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
    <div className="controller">
      <div className="controller__header">
        {gameName} · Player {id}
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
