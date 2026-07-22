import { useEffect, useRef } from 'react';
import { createInitialState, serialize, step } from '../game/engine.js';
import { renderState } from '../game/render.js';
import { vfx } from '../game/vfx.js';
import { audio } from '../game/audio.js';
import { getGameDef } from '../games.js';

const ARENA_W = 1280;
const ARENA_H = 720;

export default function GameCanvas({ mode = 'host', socket, gameName = 'TankDuel' }) {
  const canvasRef = useRef(null);
  const gameDef = getGameDef(gameName);
  const inputModel = gameDef?.inputModel || 'keys';

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!canvas || !ctx) return;

    let state = null;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (rect.width > 0 && rect.height > 0) {
        canvas.width = w;
        canvas.height = h;
      }
      if (mode === 'client' || mode === 'viewer') {
        ctx.fillStyle = '#0b0e14';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (state) renderState(ctx, canvas, state);
      }
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener('resize', resize);
    resize();

    const render = gameDef?.render || renderState;

    const unlockAudio = () => audio.unlock();
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    if (mode === 'host') {
      if (inputModel === 'actions') {
        state = gameDef.engine.createInitialState();
      } else {
        state = createInitialState(ARENA_W, ARENA_H);
      }
    }

    if (mode === 'client' || mode === 'viewer') {
      let pendingEvents = [];
      const onState = (snap) => {
        state = snap;
        window.__clientState = snap;
        if (snap && snap.events && snap.events.length) {
          for (const e of snap.events) pendingEvents.push(e);
          if (pendingEvents.length > 256) pendingEvents = pendingEvents.slice(-256);
        }
      };
      socket.on('game_state', onState);

      const onTimeout = () => {
        if (mode === 'viewer') {
          socket.data.authoritative = true;
          socket.emit('host_role', { authoritative: true });
          if (!state) state = createInitialState(ARENA_W, ARENA_H);
        }
      };
      socket.on('host_timeout', onTimeout);

      let running = true;
      let lastV = performance.now();
      const raf = requestAnimationFrame(function draw() {
        if (!running) return;
        const nowV = performance.now();
        const dtV = Math.min(0.05, (nowV - lastV) / 1000);
        lastV = nowV;
        ctx.fillStyle = '#0b0e14';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (state) {
          if (pendingEvents.length) {
            vfx.handleEvents(pendingEvents, 1, 1);
            audio.handleEvents(pendingEvents);
            pendingEvents = [];
          }
          render(ctx, canvas, state, { vfx, dtSec: dtV });
        }
        requestAnimationFrame(draw);
      });

      return () => {
        running = false;
        cancelAnimationFrame(raf);
        socket.off('game_state', onState);
        socket.off('host_timeout', onTimeout);
        ro.disconnect();
        window.removeEventListener('resize', resize);
        window.removeEventListener('pointerdown', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
      };
    }

    // ---- Host mode (authoritative simulator) ----
    let resumed = false;
    const onResume = (snap) => {
      if (inputModel === 'actions') {
        state = gameDef.engine.createInitialState();
        state.scores = snap.scores || state.scores;
        state.board = snap.board || state.board;
        state.turn = snap.turn || state.turn;
        state.cursor = snap.cursor ?? state.cursor;
        state.winner = snap.winner ?? state.winner;
        state.lastMove = snap.lastMove ?? state.lastMove;
      } else {
        state = snap;
      }
      resumed = true;
    };
    socket.on('resume_state', onResume);

    const onReset = () => {
      if (inputModel === 'actions') {
        const next = gameDef.engine.createInitialState();
        next.scores = state?.scores || { X: 0, O: 0 };
        state = next;
      } else {
        state = createInitialState(ARENA_W, ARENA_H);
      }
      resumed = true;
    };
    socket.on('game_reset', onReset);

    const onRequestState = () => {
      if (!state) return;
      const snap = inputModel === 'actions' ? gameDef.engine.serialize(state) : serialize(state);
      if (socket) socket.emit('game_state', { gameName, state: snap });
    };
    socket.on('request_state', onRequestState);

    if (inputModel === 'actions') {
      const serializeState = () => gameDef.engine.serialize(state);

      const applyFromHost = (action, controllerId = '1') => {
        const next = gameDef.engine.applyAction(state, controllerId, action);
        if (next !== state) {
          state = next;
          if (socket) socket.emit('game_state', { gameName, state: serializeState() });
        }
      };

      const onAction = (e) => applyFromHost(e.detail.action, e.detail.controllerId);
      window.addEventListener('game_action', onAction);

      const onKeyDown = (e) => {
        if (!gameDef.engine.applyKeyAction) return;
        const next = gameDef.engine.applyKeyAction(state, e.key, '1');
        if (next !== state) {
          state = next;
          if (socket) socket.emit('game_state', { gameName, state: serializeState() });
        }
      };
      window.addEventListener('keydown', onKeyDown);

      let running = true;
      const raf = requestAnimationFrame(function draw() {
        if (!running) return;
        ctx.fillStyle = '#0b0e14';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (state) render(ctx, canvas, state);
        requestAnimationFrame(draw);
      });

      return () => {
        running = false;
        cancelAnimationFrame(raf);
        window.removeEventListener('game_action', onAction);
        window.removeEventListener('keydown', onKeyDown);
        ro.disconnect();
        window.removeEventListener('resize', resize);
        window.removeEventListener('pointerdown', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
        socket.off('resume_state', onResume);
        socket.off('game_reset', onReset);
        socket.off('request_state', onRequestState);
      };
    }

    const keys = new Set();
    const onDown = (e) => keys.add(e.key.toLowerCase());
    const onUp = (e) => keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);

    const onGameKey = (e) => {
      const { key, state: kState } = e.detail || {};
      if (!key) return;
      if (kState === 'down') keys.add(key.toLowerCase());
      else keys.delete(key.toLowerCase());
    };
    window.addEventListener('game_key', onGameKey);

    const onRemoteKey = ({ key, state: kState }) => {
      if (!key) return;
      if (kState === 'down') keys.add(key.toLowerCase());
      else keys.delete(key.toLowerCase());
    };
    socket.on('host_key', onRemoteKey);

    const mountTime = Date.now();

    let running = true;
    let last = performance.now();
    let lastEmit = 0;
    let lastBeat = 0;

    function loop(now) {
      if (!running) return;
      const dt = Math.min(32, now - last);
      last = now;
      const dtSec = dt / 1000;

      state = step(state, keys, dt);

      vfx.handleEvents(state.events, 1, 1);
      audio.handleEvents(state.events);
      renderState(ctx, canvas, state, { vfx, dtSec });

      const canEmit = resumed || Date.now() - mountTime > 250;
      if (socket && canEmit && now - lastEmit >= 33) {
        lastEmit = now;
        const snap = serialize(state);
        socket.emit('game_state', { gameName, state: snap });
      }
      if (socket && now - lastBeat >= 500) {
        lastBeat = now;
        socket.emit('reserve_host');
      }
      state.events = [];
      requestAnimationFrame(loop);
    }
    const raf = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('game_key', onGameKey);
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      socket.off('host_key', onRemoteKey);
      socket.off('resume_state', onResume);
      socket.off('game_reset', onReset);
      socket.off('request_state', onRequestState);
    };
  }, [mode, socket, gameName, inputModel, gameDef]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
}
