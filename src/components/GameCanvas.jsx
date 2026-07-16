import { useEffect, useRef } from 'react';

// A self-contained 2-player Canvas game (top-down tank duel).
// It listens to window keydown/keyup events, so synthetic KeyboardEvents
// dispatched by the controllers drive Player 1 (WASD+Q/E) and
// Player 2 (Arrows+,/.). Rendered with WebGL via a 2D-canvas fallback.
export default function GameCanvas({ windowRef }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const gameWindow = window; // run in same window context
    if (windowRef) windowRef.current = gameWindow;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(300, rect.width * dpr);
      canvas.height = Math.max(200, rect.height * dpr);
    }
    resize();
    window.addEventListener('resize', resize);

    const keys = new Set();
    const onDown = (e) => keys.add(e.key.toLowerCase());
    const onUp = (e) => keys.delete(e.key.toLowerCase());
    gameWindow.addEventListener('keydown', onDown);
    gameWindow.addEventListener('keyup', onUp);

    const W = () => canvas.width;
    const H = () => canvas.height;

    const players = [
      {
        x: W() * 0.3,
        y: H() * 0.5,
        angle: 0,
        color: '#4cc9f0',
        controls: { up: 'w', down: 's', left: 'a', right: 'd', fire: 'q' },
        cooldown: 0,
        score: 0,
        alive: true,
        respawn: 0,
      },
      {
        x: W() * 0.7,
        y: H() * 0.5,
        angle: Math.PI,
        color: '#f72585',
        controls: { up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright', fire: ',' },
        cooldown: 0,
        score: 0,
        alive: true,
        respawn: 0,
      },
    ];

    const bullets = [];
    let running = true;

    function fire(p) {
      if (p.cooldown > 0 || !p.alive) return;
      p.cooldown = 28;
      const speed = 7;
      bullets.push({
        x: p.x + Math.cos(p.angle) * 24,
        y: p.y + Math.sin(p.angle) * 24,
        vx: Math.cos(p.angle) * speed,
        vy: Math.sin(p.angle) * speed,
        owner: p,
        color: p.color,
        life: 120,
      });
    }

    function reset(p) {
      p.x = p === players[0] ? W() * 0.3 : W() * 0.7;
      p.y = H() * 0.5;
      p.angle = p === players[0] ? 0 : Math.PI;
      p.alive = true;
    }

    let last = performance.now();
    function loop(now) {
      if (!running) return;
      const dt = Math.min(32, now - last);
      last = now;
      const w = W();
      const h = H();

      ctx.fillStyle = '#0b0e14';
      ctx.fillRect(0, 0, w, h);

      // grid
      ctx.strokeStyle = '#ffffff0a';
      ctx.lineWidth = 1;
      const grid = 40;
      for (let x = 0; x < w; x += grid) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += grid) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const turn = 0.045 * (dt / 16);
      const speed = 2.2 * (dt / 16);

      for (const p of players) {
        if (!p.alive) {
          p.respawn -= dt;
          if (p.respawn <= 0) reset(p);
          continue;
        }
        if (keys.has(p.controls.left)) p.angle -= turn;
        if (keys.has(p.controls.right)) p.angle += turn;
        if (keys.has(p.controls.up)) {
          p.x += Math.cos(p.angle) * speed;
          p.y += Math.sin(p.angle) * speed;
        }
        if (keys.has(p.controls.down)) {
          p.x -= Math.cos(p.angle) * speed;
          p.y -= Math.sin(p.angle) * speed;
        }
        if (keys.has(p.controls.fire)) fire(p);
        if (p.cooldown > 0) p.cooldown -= dt / 16;

        p.x = Math.max(16, Math.min(w - 16, p.x));
        p.y = Math.max(16, Math.min(h - 16, p.y));

        // draw tank
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-14, -10, 28, 20);
        ctx.fillStyle = '#fff';
        ctx.fillRect(10, -3, 16, 6);
        ctx.restore();
      }

      // bullets
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx * (dt / 16);
        b.y += b.vy * (dt / 16);
        b.life -= dt / 16;
        if (
          b.life <= 0 ||
          b.x < 0 ||
          b.x > w ||
          b.y < 0 ||
          b.y > h
        ) {
          bullets.splice(i, 1);
          continue;
        }
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
        ctx.fill();

        // collision with opponent
        const target = b.owner === players[0] ? players[1] : players[0];
        if (target.alive) {
          const dx = b.x - target.x;
          const dy = b.y - target.y;
          if (dx * dx + dy * dy < 20 * 20) {
            target.alive = false;
            target.respawn = 1500;
            b.owner.score += 1;
            bullets.splice(i, 1);
          }
        }
      }

      // score
      ctx.fillStyle = '#e6edf3';
      ctx.font = `${Math.max(16, w * 0.025)}px system-ui`;
      ctx.textAlign = 'left';
      ctx.fillText(`P1: ${players[0].score}`, 16, 34);
      ctx.textAlign = 'right';
      ctx.fillText(`P2: ${players[1].score}`, w - 16, 34);

      // respawn hints
      ctx.textAlign = 'center';
      ctx.fillStyle = '#8b98a9';
      ctx.font = `${Math.max(13, w * 0.018)}px system-ui`;
      if (!players[0].alive) ctx.fillText('P1 respawn…', w * 0.3, h * 0.5);
      if (!players[1].alive) ctx.fillText('P2 respawn…', w * 0.7, h * 0.5);

      requestAnimationFrame(loop);
    }
    const raf = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      gameWindow.removeEventListener('keydown', onDown);
      gameWindow.removeEventListener('keyup', onUp);
      if (windowRef) windowRef.current = null;
    };
  }, [windowRef]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
}
