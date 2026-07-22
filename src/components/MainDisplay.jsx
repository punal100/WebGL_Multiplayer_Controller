import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import { socket } from '../socket.js';
import { getGameDef } from '../games.js';
import { audio } from '../game/audio.js';
import GameCanvas from './GameCanvas.jsx';
import BrandLogo from './BrandLogo.jsx';

const DEFAULT_GAME = 'TankDuel';

export default function MainDisplay() {
  const { gameName = DEFAULT_GAME } = useParams();
  const GAME_NAME = gameName;
  const gameDef = getGameDef(GAME_NAME);
  const inputModel = gameDef?.inputModel || 'keys';

  const [lanIp, setLanIp] = useState('localhost');
  const [port, setPort] = useState(4567);
  const [origin, setOrigin] = useState('');
  const [status, setStatus] = useState({ 1: false, 2: false });
  const [showSettings, setShowSettings] = useState(false);
  const [soundOn, setSoundOn] = useState(true);

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

    const onStatus = ({ controllerId, connected }) => {
      setStatus((s) => ({ ...s, [String(controllerId)]: connected }));
    };

    const onDisconnect = ({ controllerId }) => {
      setStatus((s) => ({ ...s, [String(controllerId)]: false }));
    };

    socket.on('controller_status', onStatus);
    socket.on('controller_disconnected', onDisconnect);

    const onKeyDown = (e) => {
      socket.emit('host_key', { gameName: GAME_NAME, key: e.key, state: 'down' });
    };
    const onKeyUp = (e) => {
      socket.emit('host_key', { gameName: GAME_NAME, key: e.key, state: 'up' });
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      socket.off('controller_status', onStatus);
      socket.off('controller_disconnected', onDisconnect);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      socket.emit('leave_game', { gameName: GAME_NAME });
    };
  }, [GAME_NAME, inputModel]);

  const resetGame = () => {
    socket.emit('reset_game', { gameName: GAME_NAME });
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    audio.unlock();
    audio.setEnabled(next);
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
        <div className={`display__status ${status[1] ? 'connected' : 'disconnected'}`}>
          {status[1] ? 'P1 Connected' : 'P1 Waiting'}
        </div>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{c1Url}</span>
      </aside>

      <main className="display__center">
        <div className="center-actions">
          <button className="settings-btn" onClick={toggleSound} title="Toggle sound">
            {soundOn ? 'Sound: On' : 'Sound: Off'}
          </button>
          <button className="settings-btn" onClick={() => setShowSettings(true)}>
            Settings
          </button>
          <button className="reset-btn" onClick={resetGame}>
            Reset
          </button>
        </div>
        <div className="display__title">{GAME_NAME} — 2 Player</div>
        <div className="display__game">
          <GameCanvas socket={socket} gameName={GAME_NAME} />
        </div>
        <div className="controls-legend">
          <span><b>P1</b> WASD move · Q fire · E dash · R barricade · F ricochet</span>
          <span><b>P2</b> Arrows move · , fire · . dash · / barricade · &apos; ricochet</span>
        </div>
      </main>

      <aside className="display__side display__side--right">
        <h2>Player 2</h2>
        <div className="display__qr">
          <QRCodeCanvas value={c2Url} size={150} />
        </div>
        <div className={`display__status ${status[2] ? 'connected' : 'disconnected'}`}>
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
            <button className="overlay__close" onClick={() => setShowSettings(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
