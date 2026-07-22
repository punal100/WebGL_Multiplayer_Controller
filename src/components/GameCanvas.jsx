import { useEffect, useRef } from 'react';
import { renderState } from '../game/render.js';
import { vfx } from '../game/vfx.js';
import { audio } from '../game/audio.js';
import { getGameDef } from '../games.js';

export default function GameCanvas({ socket, gameName = 'TankDuel' }) {
  const canvasRef = useRef(null);
  const gameDef = getGameDef(gameName);

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
      ctx.fillStyle = '#0b0e14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (state) renderState(ctx, canvas, state);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener('resize', resize);
    resize();

    const unlockAudio = () => audio.unlock();
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    const onState = (snap) => {
      state = snap;
      if (snap?.events?.length) {
        vfx.handleEvents(snap.events, 1, 1);
        audio.handleEvents(snap.events);
      }
    };
    socket.on('game_state', onState);

    const render = gameDef?.render || renderState;
    let running = true;
    let lastV = performance.now();
    const raf = requestAnimationFrame(function draw() {
      if (!running) return;
      const nowV = performance.now();
      const dtV = Math.min(0.05, (nowV - lastV) / 1000);
      lastV = nowV;
      ctx.fillStyle = '#0b0e14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (state) render(ctx, canvas, state, { vfx, dtSec: dtV });
      requestAnimationFrame(draw);
    });

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      socket.off('game_state', onState);
      ro.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, [socket, gameName, gameDef]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
}
