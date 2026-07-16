// Authoritative game simulation. Pure logic: given a Set of currently-held
// keys, advance state by dt (ms) and return a serializable snapshot.
// Runs ONLY on the host. Controllers receive snapshots and just render them.

export function createInitialState(w, h) {
  return {
    w,
    h,
    players: [
      {
        x: w * 0.3,
        y: h * 0.5,
        angle: 0,
        color: '#4cc9f0',
        controls: { up: 'w', down: 's', left: 'a', right: 'd', fire: 'q' },
        cooldown: 0,
        score: 0,
        alive: true,
        respawn: 0,
      },
      {
        x: w * 0.7,
        y: h * 0.5,
        angle: Math.PI,
        color: '#f72585',
        controls: { up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright', fire: ',' },
        cooldown: 0,
        score: 0,
        alive: true,
        respawn: 0,
      },
    ],
    bullets: [],
  };
}

export function serialize(state) {
  return {
    w: state.w,
    h: state.h,
    players: state.players.map((p) => ({
      x: Math.round(p.x),
      y: Math.round(p.y),
      angle: +p.angle.toFixed(3),
      score: p.score,
      alive: p.alive,
      color: p.color,
    })),
    bullets: state.bullets.map((b) => ({
      x: Math.round(b.x),
      y: Math.round(b.y),
      color: b.color,
    })),
  };
}

export function step(state, keys, dt) {
  const w = state.w;
  const h = state.h;
  const turn = 0.045 * (dt / 16);
  const speed = 2.2 * (dt / 16);

  for (const p of state.players) {
    if (!p.alive) {
      p.respawn -= dt;
      if (p.respawn <= 0) {
        p.x = p === state.players[0] ? w * 0.3 : w * 0.7;
        p.y = h * 0.5;
        p.angle = p === state.players[0] ? 0 : Math.PI;
        p.alive = true;
      }
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
    if (keys.has(p.controls.fire) && p.cooldown <= 0) {
      p.cooldown = 28;
      const bs = 7;
      state.bullets.push({
        x: p.x + Math.cos(p.angle) * 24,
        y: p.y + Math.sin(p.angle) * 24,
        vx: Math.cos(p.angle) * bs,
        vy: Math.sin(p.angle) * bs,
        owner: p,
        color: p.color,
        life: 120,
      });
    }
    if (p.cooldown > 0) p.cooldown -= dt / 16;

    p.x = Math.max(16, Math.min(w - 16, p.x));
    p.y = Math.max(16, Math.min(h - 16, p.y));
  }

  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    b.x += b.vx * (dt / 16);
    b.y += b.vy * (dt / 16);
    b.life -= dt / 16;
    if (b.life <= 0 || b.x < 0 || b.x > w || b.y < 0 || b.y > h) {
      state.bullets.splice(i, 1);
      continue;
    }
    const target = b.owner === state.players[0] ? state.players[1] : state.players[0];
    if (target.alive) {
      const dx = b.x - target.x;
      const dy = b.y - target.y;
      if (dx * dx + dy * dy < 20 * 20) {
        target.alive = false;
        target.respawn = 1500;
        b.owner.score += 1;
        state.bullets.splice(i, 1);
      }
    }
  }

  return state;
}
