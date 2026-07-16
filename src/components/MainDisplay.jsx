import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import { socket } from '../socket.js';
import { KEY_MAP, dispatchSyntheticKey } from '../inputMap.js';
import GameCanvas from './GameCanvas.jsx';
import BrandLogo from './BrandLogo.jsx';

const DEFAULT_GAME = 'TickTackToe';

export default function MainDisplay() {
  const { gameName = DEFAULT_GAME } = useParams();
  const GAME_NAME = gameName;
  const [lanIp, setLanIp] = useState('localhost');
  const [port, setPort] = useState(4567);
  const [origin, setOrigin] = useState('');
  const [status, setStatus] = useState({ 1: false, 2: false });
  const [showSettings, setShowSettings] = useState(false);
  const [isViewer, setIsViewer] = useState(false);
  const viewerRef = useRef(false);
  const gameWindowRef = useRef(null);
  const pressedByController = useRef({ 1: new Set(), 2: new Set() });

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((c) => {
        setLanIp(c.lanIp);
        setPort(c.port);
        setOrigin(c.origin || `http://${c.lanIp}:${c.port}`);
      })
      .catch(() => {});

    socket.emit('join_game', { gameName: GAME_NAME, role: 'host' });

    // The server tells us whether THIS main window is the single authoritative
    // simulator. Any extra main window becomes a viewer: it must not process
    // controller input (only the authoritative host drives the game).
    const onHostRole = ({ authoritative }) => {
      setIsViewer(!authoritative);
      viewerRef.current = !authoritative;
    };

    const onInput = (payload) => {
      if (viewerRef.current) return;
      const { controllerId, button, state } = payload;
      const id = String(controllerId);
      const map = KEY_MAP[id];
      if (!map) return;
      const key = map[button];
      if (!key) return;
      const pressed = pressedByController.current[id];
      if (state === 'down') {
        pressed.add(button);
        dispatchSyntheticKey(gameWindowRef.current, key, true);
      } else {
        pressed.delete(button);
        dispatchSyntheticKey(gameWindowRef.current, key, false);
      }
    };

    const onStatus = ({ controllerId, connected }) => {
      setStatus((s) => ({ ...s, [String(controllerId)]: connected }));
    };

    const onDisconnect = ({ controllerId }) => {
      if (viewerRef.current) {
        setStatus((s) => ({ ...s, [String(controllerId)]: false }));
        return;
      }
      const id = String(controllerId);
      const map = KEY_MAP[id];
      const pressed = pressedByController.current[id];
      pressed.forEach((button) => {
        const key = map[button];
        if (key) dispatchSyntheticKey(gameWindowRef.current, key, false);
      });
      pressed.clear();
      setStatus((s) => ({ ...s, [id]: false }));
    };

    socket.on('controller_input', onInput);
    socket.on('controller_status', onStatus);
    socket.on('controller_disconnected', onDisconnect);
    socket.on('host_role', onHostRole);

    // Any main window's own keyboard should drive the game, even a viewer
    // window. The authoritative host applies keys locally; viewer windows
    // relay their key presses to the authoritative host via the server.
    const onKeyDown = (e) => {
      if (viewerRef.current) socket.emit('host_key', { gameName: GAME_NAME, key: e.key, state: 'down' });
    };
    const onKeyUp = (e) => {
      if (viewerRef.current) socket.emit('host_key', { gameName: GAME_NAME, key: e.key, state: 'up' });
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      socket.off('controller_input', onInput);
      socket.off('controller_status', onStatus);
      socket.off('controller_disconnected', onDisconnect);
      socket.off('host_role', onHostRole);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [GAME_NAME]);

  const resetGame = () => {
    socket.emit('reset_game', { gameName: GAME_NAME });
  };

  const base = origin || `http://${lanIp}:${port}`;
  const c1Url = `${base}/Game/${GAME_NAME}/1`;
  const c2Url = `${base}/Game/${GAME_NAME}/2`;

  return (
    <div className="display">
      <BrandLogo className="brand-logo--corner" />
      <aside className="display__side">
        <h2>Player 1</h2>
        <div className="display__qr">
          <QRCodeCanvas value={c1Url} size={150} />
        </div>
        <div
          className={`display__status ${
            status[1] ? 'connected' : 'disconnected'
          }`}
        >
          {status[1] ? 'P1 Connected' : 'P1 Waiting'}
        </div>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{c1Url}</span>
      </aside>

      <main className="display__center">
        <div className="center-actions">
          <button className="settings-btn" onClick={() => setShowSettings(true)}>
            Settings
          </button>
          <button className="reset-btn" onClick={resetGame}>
            Reset
          </button>
        </div>
        <div className="display__title">{GAME_NAME} — 2 Player</div>
        <div className="display__game">
          <GameCanvas
            mode={isViewer ? 'viewer' : 'host'}
            socket={socket}
            gameName={GAME_NAME}
            windowRef={isViewer ? undefined : gameWindowRef}
          />
        </div>
      </main>

      <aside className="display__side display__side--right">
        <h2>Player 2</h2>
        <div className="display__qr">
          <QRCodeCanvas value={c2Url} size={150} />
        </div>
        <div
          className={`display__status ${
            status[2] ? 'connected' : 'disconnected'
          }`}
        >
          {status[2] ? 'P2 Connected' : 'P2 Waiting'}
        </div>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{c2Url}</span>
      </aside>

      {showSettings && (
        <div className="overlay" onClick={() => setShowSettings(false)}>
          <div className="overlay__card" onClick={(e) => e.stopPropagation()}>
            <h3>Host Settings</h3>
            <div className="overlay__row">
              <span>Game</span>
              <span>{GAME_NAME}</span>
            </div>
            <div className="overlay__row">
              <span>Public URL</span>
              <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{base}</span>
            </div>
            <div className="overlay__row">
              <span>LAN IP</span>
              <span>{lanIp}:{port}</span>
            </div>
            <div className="overlay__row">
              <span>Player 1</span>
              <span>{status[1] ? 'Connected' : 'Offline'}</span>
            </div>
            <div className="overlay__row">
              <span>Player 2</span>
              <span>{status[2] ? 'Connected' : 'Offline'}</span>
            </div>
            <button className="overlay__reset" onClick={resetGame}>
              Reset Game
            </button>
            <button
              className="overlay__close"
              onClick={() => setShowSettings(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
