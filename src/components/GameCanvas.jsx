import { useEffect, useRef } from 'react';
import { createInitialState, serialize, step } from '../game/engine.js';
import { renderState } from '../game/render.js';
import { vfx } from '../game/vfx.js';
import { audio } from '../game/audio.js';
import { getGameDef } from '../games.js';

// Fixed logical arena size (simulation/coordinate space) for TankDuel. It is
// independent of the canvas/window pixel size; renderState letterboxes it into
// the canvas. Keeping this constant means the playfield never resizes or drifts
// when the browser window changes.
const ARENA_W = 1280;
const ARENA_H = 720;

// Host mode: the SINGLE authoritative simulator. Steps the game, draws it,
// and broadcasts state snapshots (~30Hz) so controllers (and any extra
// viewer main windows) stay in sync.
// Viewer mode: an extra main window. It must NOT simulate or broadcast,
// otherwise two independent sets of character data would fight and the
// connected controllers would flicker. It only renders the server state.
// Client mode: a phone controller. Receives snapshots and only renders them.
//
// Two input models are supported, selected per game via the registry:
//   - 'keys'    (TankDuel): held-key real-time simulation (original path).
//   - 'actions' (TicTacToe): discrete actions applied to authoritative state.
export default function GameCanvas({ mode = 'host', socket, gameName = 'TankDuel' }) {
  const canvasRef = useRef(null);
  const gameDef = getGameDef(gameName);
  const inputModel = gameDef?.inputModel || 'keys';

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    let state = null;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      // Match the drawing buffer to the element's real size (including its
      // device pixel ratio) so the game is never stretched, even when the
      // container has an unusual aspect ratio (e.g. the controller's
      // horizontal view). Avoid enforcing a minimum that would distort the
      // buffer's aspect ratio relative to the box.
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      // Only resize the buffer when the box actually has a non-zero size.
      // Resizing to a 0xN (or Nx0) buffer during a flex reflow would produce
      // a distorted/garbled frame and can surface as a purple placeholder.
      if (rect.width > 0 && rect.height > 0) {
        canvas.width = w;
        canvas.height = h;
      }
      // Repaint one frame immediately so a mid-layout-transition buffer never
      // lingers on screen.
      if (mode === 'client' || mode === 'viewer') {
        ctx.fillStyle = '#0b0e14';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (state) renderState(ctx, canvas, state);
      }
    }

    const render = gameDef?.render || renderState;

    // Unlock audio on the first user gesture (browsers require it). The manager
    // no-ops until then, so this is safe to call repeatedly.
    const unlockAudio = () => audio.unlock();
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    // Host seeds an initial state immediately so its buffer is valid from the
    // first frame. Client/viewer start with null state and wait for snapshots.
    if (mode === 'host') {
      if (inputModel === 'actions') {
        state = gameDef.engine.createInitialState();
      } else {
        // The simulation runs in a FIXED logical arena space (independent of the
        // canvas/window size). renderState letterboxes this space into the canvas
        // with a uniform scale, so the arena keeps a correct, stable size and
        // stays centered no matter how the browser is resized. We no longer
        // couple state.w/state.h to canvas pixels (that coupling made the arena
        // shrink / drift toward the top-left on resize).
        state = createInitialState(ARENA_W, ARENA_H);
      }
    }

    resize();
    // Observe the canvas box (not just window resize) so the drawing buffer
    // re-matches whenever the layout changes — including an orientation toggle
    // that swaps the CSS class and alters the view's aspect ratio. The arena
    // space itself never changes; only the buffer/letterbox does.
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener('resize', resize);

    if (mode === 'client' || mode === 'viewer') {
      // Neither client nor an extra viewer window ever simulates. They start
      // with no state and only draw once a real host snapshot arrives (no
      // initial-spawn flicker, no duplicate source of truth).
      // Accumulate transient events across snapshots (don't overwrite): the
      // host streams ~30 snapshots/sec but the draw loop may run faster or
      // slower, so several snapshots can arrive between two paint frames. If
      // we only kept the LAST snapshot's events, the others' VFX/SFX would be
      // dropped — the intermittent "effects don't play on the controller"
      // desync. We cap the buffer so a stalled loop can't grow it forever.
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

      // Repaint the latest snapshot every frame. A blank canvas is drawn
      // until the first snapshot lands.
      let running = true;
      let lastV = performance.now();
      const raf = requestAnimationFrame(function draw() {
        if (!running) return;
        const nowV = performance.now();
        const dtV = Math.min(0.05, (nowV - lastV) / 1000);
        lastV = nowV;
        // Always paint a solid background so the canvas never shows through as
        // a transparent/garbled (purple) placeholder when no snapshot has
        // arrived yet or while the container is mid-resize.
        ctx.fillStyle = '#0b0e14';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (state) {
          // Replay this snapshot's transient events ONCE as VFX + audio
          // (scaled to the local canvas), then draw the world + particles.
          // Spawn VFX in the snapshot's arena coordinate space (state.w/h);
          // renderState maps that space into the centered, uniformly-scaled
          // playfield box, so clients and host render particles identically.
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
        ro.disconnect();
        window.removeEventListener('resize', resize);
      };
    }

    // ---- Host mode (authoritative simulator) ----

    // Resume from server-persisted state (so a main-page reload keeps the
    // current progress instead of resetting). For 'actions' games we also copy
    // the running scores forward so a round restart doesn't wipe the match.
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
    socket && socket.on('resume_state', onResume);

    // Reset: reseed authoritative state (keep match scores for 'actions').
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
    socket && socket.on('game_reset', onReset);

    // A late-joining controller/viewer asks for the current state so it can
    // render immediately (turn-based games don't stream state continuously).
    const onRequestState = () => {
      if (!state) return;
      const snap =
        inputModel === 'actions' ? gameDef.engine.serialize(state) : serialize(state);
      if (socket) socket.emit('game_state', { gameName, state: snap });
    };
    socket && socket.on('request_state', onRequestState);

    if (inputModel === 'actions') {
      // Discrete-action games: apply player actions to the authoritative state
      // and broadcast. No continuous simulation loop is needed.
      const serializeState = () => gameDef.engine.serialize(state);

      const applyFromHost = (action, controllerId = '1') => {
        const next = gameDef.engine.applyAction(state, controllerId, action);
        if (next !== state) {
          state = next;
          if (socket) socket.emit('game_state', { gameName, state: serializeState() });
        }
      };

      // Actions arriving from controllers (dispatched by MainDisplay).
      const onAction = (e) => {
        applyFromHost(e.detail.action, e.detail.controllerId);
      };
      window.addEventListener('game_action', onAction);

      // Host keyboard fallback (direct play without controllers).
      const onKeyDown = (e) => {
        if (!gameDef.engine.applyKeyAction) return;
        const next = gameDef.engine.applyKeyAction(state, e.key, '1');
        if (next !== state) {
          state = next;
          if (socket) socket.emit('game_state', { gameName, state: serializeState() });
        }
      };
      window.addEventListener('keydown', onKeyDown);

      // Steady repaint loop (also covers resume/reset broadcasts already sent).
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
        socket && socket.off('resume_state', onResume);
        socket && socket.off('game_reset', onReset);
        socket && socket.off('request_state', onRequestState);
      };
    }

    // ---- 'keys' input model (TankDuel): held-key real-time simulation ----
    const keys = new Set();
    const onDown = (e) => keys.add(e.key.toLowerCase());
    const onUp = (e) => keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);

    // Controller input arrives as a direct `game_key` custom event from
    // MainDisplay (no fragile synthetic KeyboardEvents). Feed it straight into
    // the same `keys` set the local keyboard uses, so phones drive the sim
    // exactly like a physical keyboard would.
    const onGameKey = (e) => {
      const { key, state: kState } = e.detail || {};
      if (!key) return;
      if (kState === 'down') keys.add(key.toLowerCase());
      else keys.delete(key.toLowerCase());
    };
    window.addEventListener('game_key', onGameKey);

    // Remote keyboard input relayed from other (viewer) main windows. Apply
    // it to the same keys set so input works in ANY main window while the
    // single simulation stays the only source of truth.
    const onRemoteKey = ({ key, state: kState }) => {
      if (!key) return;
      if (kState === 'down') keys.add(key.toLowerCase());
      else keys.delete(key.toLowerCase());
    };
    socket && socket.on('host_key', onRemoteKey);

    const mountTime = Date.now();

    let running = true;
    let last = performance.now();
    let lastEmit = 0;

    function loop(now) {
      if (!running) return;
      const dt = Math.min(32, now - last);
      last = now;
      const dtSec = dt / 1000;

      state = step(state, keys, dt);

      // Decoupled event bus: feed this frame's engine events to VFX + audio.
      // The VFX manager keeps its own particle list across frames; we only
      // hand it the NEW events each tick.
      vfx.handleEvents(state.events, 1, 1);
      audio.handleEvents(state.events);
      renderState(ctx, canvas, state, { vfx, dtSec });

      // Don't broadcast the initial spawn before we've resumed the saved
      // state (avoids a 1-frame flicker on connected controllers). Fallback
      // after 250ms so a brand-new room still starts broadcasting.
      const canEmit = resumed || Date.now() - mountTime > 250;
      if (socket && canEmit && now - lastEmit >= 33) {
        lastEmit = now;
        const snap = serialize(state);
        socket.emit('game_state', { gameName, state: snap });
        if (mode === 'host') window.__hostState = snap;
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
      socket && socket.off('resume_state', onResume);
      socket && socket.off('game_reset', onReset);
      socket && socket.off('host_key', onRemoteKey);
      socket && socket.off('request_state', onRequestState);
    };
  }, [mode, socket, gameName, inputModel, gameDef]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
}

