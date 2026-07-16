import { useEffect, useRef } from 'react';
import { createInitialState, serialize, step } from '../game/engine.js';
import { renderState } from '../game/render.js';

// Host mode: simulates the authoritative game, draws it, and broadcasts
// state snapshots (~30Hz) so controllers stay in sync.
// Client mode: receives snapshots and only renders them (no simulation).
export default function GameCanvas({ mode = 'host', socket, gameName = 'TickTackToe', windowRef }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(300, rect.width * dpr);
      canvas.height = Math.max(200, rect.height * dpr);
    }
    resize();
    window.addEventListener('resize', resize);

    let state = createInitialState(canvas.width, canvas.height);
    // Re-seed dimensions on resize for host so coordinates stay consistent
    const onResizeHost = () => {
      if (mode === 'host') state.w = canvas.width, state.h = canvas.height;
    };
    window.addEventListener('resize', onResizeHost);

    if (mode === 'client' && socket) {
      // Client never simulates and must NEVER show its own initial spawn.
      // Start with no state; only draw once a real host snapshot arrives.
      state = null;
      const onState = (snap) => {
        state = snap;
        window.__clientState = snap;
      };
      socket.on('game_state', onState);

      // Repaint the latest snapshot every frame. A blank canvas is drawn
      // until the first snapshot lands (no initial-spawn flicker).
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

    // Host mode
    const keys = new Set();
    const onDown = (e) => keys.add(e.key.toLowerCase());
    const onUp = (e) => keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    if (windowRef) windowRef.current = window;

    let running = true;
    let last = performance.now();
    let lastEmit = 0;

    function loop(now) {
      if (!running) return;
      const dt = Math.min(32, now - last);
      last = now;

      state = step(state, keys, dt);
      renderState(ctx, canvas, state);

      if (socket && now - lastEmit >= 33) {
        lastEmit = now;
        socket.emit('game_state', { gameName, state: serialize(state) });
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
      if (windowRef) windowRef.current = null;
    };
  }, [mode, socket, gameName, windowRef]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
}
