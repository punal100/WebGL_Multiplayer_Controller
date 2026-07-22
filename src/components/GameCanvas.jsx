import { useEffect, useRef } from 'react';
import { renderState } from '../game/render.js';
import { vfx } from '../game/vfx.js';
import { audio } from '../game/audio.js';
import { getGameDef } from '../games.js';

const DEFAULT_SMOOTHING_MS = 25;

function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

function lerpAngle(from, to, amount) {
  const tau = Math.PI * 2;
  const delta = ((to - from + Math.PI) % tau + tau) % tau - Math.PI;
  return from + delta * amount;
}

function interpolateTankState(from, to, amount) {
  if (!from || amount >= 1) return to;
  const previousPlayers = new Map((from.players || []).map((player) => [player.idx, player]));

  return {
    ...to,
    players: (to.players || []).map((player) => {
      const previous = previousPlayers.get(player.idx);
      const distance = previous
        ? Math.hypot(player.x - previous.x, player.y - previous.y)
        : Infinity;
      if (!previous || previous.alive !== player.alive || distance > 160) return player;

      return {
        ...player,
        x: lerp(previous.x, player.x, amount),
        y: lerp(previous.y, player.y, amount),
        angle: lerpAngle(previous.angle, player.angle, amount),
        turret: lerpAngle(previous.turret ?? previous.angle, player.turret ?? player.angle, amount),
      };
    }),
  };
}

export default function GameCanvas({ socket, gameName = 'TankDuel', smoothMotion = false }) {
  const canvasRef = useRef(null);
  const gameDef = getGameDef(gameName);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!canvas || !ctx) return;

    let state = null;
    let transitionFrom = null;
    let transitionStartedAt = 0;
    let transitionDuration = DEFAULT_SMOOTHING_MS;
    let lastSnapshotAt = 0;

    function getRenderState(now) {
      if (!smoothMotion || gameName !== 'TankDuel' || !transitionFrom || !state) return state;
      const amount = Math.min(1, (now - transitionStartedAt) / transitionDuration);
      return interpolateTankState(transitionFrom, state, amount);
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = smoothMotion ? Math.min(window.devicePixelRatio || 1, 2) : (window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (rect.width > 0 && rect.height > 0) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.fillStyle = '#0b0e14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const renderableState = getRenderState(performance.now());
      if (renderableState) renderState(ctx, canvas, renderableState);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener('resize', resize);
    resize();

    const unlockAudio = () => audio.unlock();
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    const onState = (snap) => {
      const now = performance.now();
      if (smoothMotion && gameName === 'TankDuel' && state) {
        transitionFrom = getRenderState(now);
        if (lastSnapshotAt) {
          transitionDuration = Math.max(16, Math.min(40, (now - lastSnapshotAt) * 0.75));
        }
        transitionStartedAt = now;
      }
      state = snap;
      lastSnapshotAt = now;
      if (snap?.events?.length) {
        vfx.handleEvents(snap.events, 1, 1);
        audio.handleEvents(snap.events);
      }
    };
    socket.on('game_state', onState);

    const render = gameDef?.render || renderState;
    let running = true;
    let lastV = performance.now();
    let raf = requestAnimationFrame(function draw() {
      if (!running) return;
      const nowV = performance.now();
      const dtV = Math.min(0.05, (nowV - lastV) / 1000);
      lastV = nowV;
      ctx.fillStyle = '#0b0e14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const renderableState = getRenderState(nowV);
      if (renderableState) render(ctx, canvas, renderableState, { vfx, dtSec: dtV });
      raf = requestAnimationFrame(draw);
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
  }, [socket, gameName, gameDef, smoothMotion]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
}
