import { useEffect, useRef } from 'react';
import { createInitialState, serialize, step } from '../game/engine.js';
import { renderState } from '../game/render.js';

// Host mode: the SINGLE authoritative simulator. Steps the game, draws it,
// and broadcasts state snapshots (~30Hz) so controllers (and any extra
// viewer main windows) stay in sync.
// Viewer mode: an extra main window. It must NOT simulate or broadcast,
// otherwise two independent sets of character data would fight and the
// connected controllers would flicker. It only renders the server state.
// Client mode: a phone controller. Receives snapshots and only renders them.
export default function GameCanvas({ mode = 'host', socket, gameName = 'TickTackToe', windowRef }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      // Match the drawing buffer to the element's real size (including its
      // device pixel ratio) so the game is never stretched, even when the
      // container has an unusual aspect ratio (e.g. the controller's
      // horizontal view). Avoid enforcing a minimum that would distort the
      // buffer's aspect ratio relative to the box.
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    }
    resize();
    window.addEventListener('resize', resize);

    let state = createInitialState(canvas.width, canvas.height);
    // Re-seed dimensions on resize for host so coordinates stay consistent
    const onResizeHost = () => {
      if (mode === 'host') state.w = canvas.width, state.h = canvas.height;
    };
    window.addEventListener('resize', onResizeHost);

    if (mode === 'client' || mode === 'viewer') {
      // Neither client nor an extra viewer window ever simulates. They start
      // with no state and only draw once a real host snapshot arrives (no
      // initial-spawn flicker, no duplicate source of truth).
      state = null;
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
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (state) renderState(ctx, canvas, state);
        requestAnimationFrame(draw);
      });

      return () => {
        running = false;
        cancelAnimationFrame(raf);
        socket.off('game_state', onState);
        window.removeEventListener('resize', resize);
        window.removeEventListener('resize', onResizeHost);
      };
    }

    // Host mode (authoritative simulator)
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

    // Resume from server-persisted state (so a main-page reload keeps the
    // current positions/rotations/score instead of resetting). We hold off
    // broadcasting until this arrives (or a short fallback) so controllers
    // never see a single frame of the local initial spawn.
    let resumed = false;
    const onResume = (snap) => {
      keys.clear();
      state = snap;
      resumed = true;
    };
    socket && socket.on('resume_state', onResume);

    // Reset button: reseed the authoritative state.
    const onReset = () => {
      keys.clear();
      state = createInitialState(canvas.width, canvas.height);
      resumed = true;
    };
    socket && socket.on('game_reset', onReset);

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
      window.removeEventListener('resize', resize);
      window.removeEventListener('resize', onResizeHost);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      socket && socket.off('resume_state', onResume);
      socket && socket.off('game_reset', onReset);
      socket && socket.off('host_key', onRemoteKey);
      if (windowRef) windowRef.current = null;
    };
  }, [mode, socket, gameName, windowRef]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
}
