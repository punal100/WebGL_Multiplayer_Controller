import { useEffect, useRef } from 'react';
import { createInitialState, serialize, step } from '../game/engine.js';
import { renderState } from '../game/render.js';
import { getGameDef } from '../games.js';

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
export default function GameCanvas({ mode = 'host', socket, gameName = 'TankDuel', windowRef }) {
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

    // Host seeds an initial state immediately so its buffer is valid from the
    // first frame. Client/viewer start with null state and wait for snapshots.
    if (mode === 'host') {
      if (inputModel === 'actions') {
        state = gameDef.engine.createInitialState();
      } else {
        state = createInitialState(canvas.width, canvas.height);
      }
    }

    resize();
    // Observe the canvas box (not just window resize) so the drawing buffer
    // re-matches whenever the layout changes — including an orientation toggle
    // that swaps the CSS class and alters the view's aspect ratio. Without
    // this the stale buffer aspect would stretch/squish the rendered game.
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener('resize', resize);

    // Re-seed dimensions on resize for host so coordinates stay consistent
    const onResizeHost = () => {
      if (mode === 'host' && inputModel === 'keys') {
        state.w = canvas.width;
        state.h = canvas.height;
      }
    };
    window.addEventListener('resize', onResizeHost);

    if (mode === 'client' || mode === 'viewer') {
      // Neither client nor an extra viewer window ever simulates. They start
      // with no state and only draw once a real host snapshot arrives (no
      // initial-spawn flicker, no duplicate source of truth).
      const onState = (snap) => {
        state = snap;
        window.__clientState = snap;
      };
      socket.on('game_state', onState);

      // Repaint the latest snapshot every frame. A blank canvas is drawn
      // until the first snapshot lands.
      let running = true;
      const raf = requestAnimationFrame(function draw() {
        if (!running) return;
        // Always paint a solid background so the canvas never shows through as
        // a transparent/garbled (purple) placeholder when no snapshot has
        // arrived yet or while the container is mid-resize.
        ctx.fillStyle = '#0b0e14';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (state) render(ctx, canvas, state);
        requestAnimationFrame(draw);
      });

      return () => {
        running = false;
        cancelAnimationFrame(raf);
        socket.off('game_state', onState);
        ro.disconnect();
        window.removeEventListener('resize', resize);
        window.removeEventListener('resize', onResizeHost);
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
        state = createInitialState(canvas.width, canvas.height);
      }
      resumed = true;
    };
    socket && socket.on('game_reset', onReset);

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
        if (next !== state) {
          state = next;
          if (socket) socket.emit('game_state', { gameName, state: serializeState() });
        }
      };
      window.addEventListener('keydown', onKeyDown);
      if (windowRef) windowRef.current = window;

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
        window.removeEventListener('resize', onResizeHost);
        socket && socket.off('resume_state', onResume);
        socket && socket.off('game_reset', onReset);
        if (windowRef) windowRef.current = null;
      };
    }

    // ---- 'keys' input model (TankDuel): held-key real-time simulation ----
    const keys = new Set();
    const onDown = (e) => keys.add(e.key.toLowerCase());
    const onUp = (e) => keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    if (windowRef) windowRef.current = window;

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

      state = step(state, keys, dt);
      renderState(ctx, canvas, state);

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
      requestAnimationFrame(loop);
    }
    const raf = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('resize', onResizeHost);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      socket && socket.off('resume_state', onResume);
      socket && socket.off('game_reset', onReset);
      socket && socket.off('host_key', onRemoteKey);
      if (windowRef) windowRef.current = null;
    };
  }, [mode, socket, gameName, windowRef, inputModel, gameDef]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
}

