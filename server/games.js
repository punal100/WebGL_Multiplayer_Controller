const PLAYER_CONTROLS = [
  { up: 'w', down: 's', left: 'a', right: 'd', fire: 'q', dash: 'e', mine: 'r', special: 'f' },
  { up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright', fire: ',', dash: '.', mine: '/', special: "'" },
];

const ABILITY = {
  DASH_DURATION: 0.2,
  DASH_COOLDOWN: 3.0,
  DASH_MULTIPLIER: 3.0,
  MINE_COOLDOWN: 8.0,
  MINE_HEALTH: 50,
  MINE_LIFETIME: 20,
  SPECIAL_COOLDOWN: 5.0,
  SPECIAL_BOUNCES: 2,
  FIRE_COOLDOWN: 28,
};

function makePlayer(x, y, angle, color, idx) {
  return {
    idx, x, y, angle, turret: angle, color,
    cooldown: 0, score: 0, alive: true, respawn: 0,
    abilities: { DashCooldown: 0, MineCooldown: 0, SpecialFireCooldown: 0 },
    isDashing: false, dashTimer: 0, moving: false,
  };
}

function hydrate(state) {
  if (!state) return state;
  if (!Array.isArray(state.walls)) state.walls = [];
  if (!Array.isArray(state.barricades)) state.barricades = [];
  if (!Array.isArray(state.bullets)) state.bullets = [];
  if (!Array.isArray(state.events)) state.events = [];
  if (typeof state.shake !== 'number') state.shake = 0;
  if (!Array.isArray(state.players)) return state;
  state.players.forEach((p, i) => {
    const dash = p.dash ?? (p.abilities && p.abilities.DashCooldown);
    const mine = p.mine ?? (p.abilities && p.abilities.MineCooldown);
    const special = p.special ?? (p.abilities && p.abilities.SpecialFireCooldown);
    p.abilities = {
      DashCooldown: typeof dash === 'number' ? dash : 0,
      MineCooldown: typeof mine === 'number' ? mine : 0,
      SpecialFireCooldown: typeof special === 'number' ? special : 0,
    };
    if (typeof p.turret !== 'number') p.turret = p.angle || 0;
    if (typeof p.isDashing !== 'boolean') p.isDashing = false;
    if (typeof p.dashTimer !== 'number') p.dashTimer = 0;
    if (typeof p.moving !== 'boolean') p.moving = false;
    if (typeof p.idx !== 'number') p.idx = i;
  });
  return state;
}

function createTankState(w, h) {
  const state = {
    w, h,
    players: [
      makePlayer(w * 0.3, h * 0.5, 0, '#4cc9f0', 0),
      makePlayer(w * 0.7, h * 0.5, Math.PI, '#f72585', 1),
    ],
    bullets: [],
    barricades: [],
    walls: [
      { x: w * 0.5, y: h * 0.28, w: 70, h: 18, hp: Infinity },
      { x: w * 0.5, y: h * 0.72, w: 70, h: 18, hp: Infinity },
      { x: w * 0.22, y: h * 0.5, w: 18, h: 90, hp: Infinity },
      { x: w * 0.78, y: h * 0.5, w: 18, h: 90, hp: Infinity },
    ],
    events: [],
    shake: 0,
  };
  return state;
}

function emit(state, type, data) {
  state.events.push({ type, ...data });
}

function serializeTank(state) {
  return {
    w: state.w, h: state.h,
    players: state.players.map((p) => ({
      idx: p.idx, x: Math.round(p.x), y: Math.round(p.y),
      angle: +p.angle.toFixed(3), turret: +p.turret.toFixed(3),
      score: p.score, alive: p.alive, color: p.color, cooldown: p.cooldown,
      respawn: p.respawn, moving: p.moving, isDashing: p.isDashing,
      dash: +p.abilities.DashCooldown.toFixed(2),
      mine: +p.abilities.MineCooldown.toFixed(2),
      special: +p.abilities.SpecialFireCooldown.toFixed(2),
    })),
    bullets: state.bullets.map((b) => ({
      x: Math.round(b.x), y: Math.round(b.y), color: b.color,
      ricochet: !!b.ricochet, bounces: b.bounces,
    })),
    barricades: state.barricades.map((m) => ({ x: Math.round(m.x), y: Math.round(m.y), hp: m.hp })),
    walls: state.walls.map((wl) => ({ x: wl.x, y: wl.y, w: wl.w, h: wl.h })),
    shake: +state.shake.toFixed(3),
    events: state.events.map((e) => ({ ...e, x: Math.round(e.x ?? 0), y: Math.round(e.y ?? 0) })),
  };
}

function rectHit(px, py, r, rect) {
  const hw = rect.w / 2 + r;
  const hh = rect.h / 2 + r;
  return Math.abs(px - rect.x) < hw && Math.abs(py - rect.y) < hh;
}

function resolveRectCollision(obj, rect, r) {
  const dx = obj.x - rect.x;
  const dy = obj.y - rect.y;
  const ox = rect.w / 2 + r - Math.abs(dx);
  const oy = rect.h / 2 + r - Math.abs(dy);
  if (ox <= 0 || oy <= 0) return false;
  if (ox < oy) {
    obj.x += dx > 0 ? ox : -ox;
    return 'x';
  }
  obj.y += dy > 0 ? oy : -oy;
  return 'y';
}

function stepTank(state, keys, dt) {
  state = hydrate(state);
  const w = state.w;
  const h = state.h;
  const f = dt / 16;
  const turn = 0.045 * f;
  const speed = 2.2 * f;

  if (state.shake > 0) state.shake = Math.max(0, state.shake - 0.04 * f);

  state.players.forEach((p, idx) => {
    const c = PLAYER_CONTROLS[idx];
    if (!p.alive) {
      p.respawn -= dt;
      if (p.respawn <= 0) {
        p.x = idx === 0 ? w * 0.3 : w * 0.7;
        p.y = h * 0.5;
        p.angle = idx === 0 ? 0 : Math.PI;
        p.turret = p.angle;
        p.alive = true;
      }
      return;
    }
    p.moving = false;

    if (p.abilities.DashCooldown > 0) p.abilities.DashCooldown = Math.max(0, p.abilities.DashCooldown - dt / 1000);
    if (p.abilities.MineCooldown > 0) p.abilities.MineCooldown = Math.max(0, p.abilities.MineCooldown - dt / 1000);
    if (p.abilities.SpecialFireCooldown > 0) p.abilities.SpecialFireCooldown = Math.max(0, p.abilities.SpecialFireCooldown - dt / 1000);
    if (p.cooldown > 0) p.cooldown -= dt / 16;
    if (p.isDashing) {
      p.dashTimer -= dt / 1000;
      if (p.dashTimer <= 0) p.isDashing = false;
    }

    if (keys.has(c.left)) p.angle -= turn;
    if (keys.has(c.right)) p.angle += turn;
    p.turret = p.angle;

    let mv = 1;
    if (p.isDashing) mv = ABILITY.DASH_MULTIPLIER;

    if (keys.has(c.up)) {
      p.x += Math.cos(p.angle) * speed * mv;
      p.y += Math.sin(p.angle) * speed * mv;
      p.moving = true;
    }
    if (keys.has(c.down)) {
      p.x -= Math.cos(p.angle) * speed * mv;
      p.y -= Math.sin(p.angle) * speed * mv;
      p.moving = true;
    }

    p.x = Math.max(16, Math.min(w - 16, p.x));
    p.y = Math.max(16, Math.min(h - 16, p.y));
    for (const wl of state.walls) resolveRectCollision(p, wl, 14);
    for (const b of state.barricades) resolveRectCollision(p, b, 14);

    if (keys.has(c.dash) && p.abilities.DashCooldown <= 0 && !p.isDashing) {
      p.isDashing = true;
      p.dashTimer = ABILITY.DASH_DURATION;
      p.abilities.DashCooldown = ABILITY.DASH_COOLDOWN;
      emit(state, 'vfx_dash', { x: p.x, y: p.y, color: p.color });
    }

    if (keys.has(c.mine) && p.abilities.MineCooldown <= 0) {
      const bx = p.x - Math.cos(p.angle) * 50;
      const by = p.y - Math.sin(p.angle) * 50;
      state.barricades.push({
        x: bx, y: by, w: 28, h: 28,
        hp: ABILITY.MINE_HEALTH, life: ABILITY.MINE_LIFETIME, owner: p.idx,
      });
      p.abilities.MineCooldown = ABILITY.MINE_COOLDOWN;
      emit(state, 'sfx_deploy', { x: bx, y: by });
    }

    if (keys.has(c.fire) && p.cooldown <= 0) {
      p.cooldown = ABILITY.FIRE_COOLDOWN;
      const bs = 7;
      state.bullets.push({
        x: p.x + Math.cos(p.angle) * 24,
        y: p.y + Math.sin(p.angle) * 24,
        vx: Math.cos(p.angle) * bs,
        vy: Math.sin(p.angle) * bs,
        owner: p, color: p.color, life: 120,
        ricochet: false, bounces: 0,
      });
      emit(state, 'sfx_shoot', { x: p.x, y: p.y, pitch: 0.9 + Math.random() * 0.2 });
      emit(state, 'vfx_muzzle', { x: p.x + Math.cos(p.angle) * 24, y: p.y + Math.sin(p.angle) * 24, angle: p.angle, color: p.color });
    }

    if (keys.has(c.special) && p.abilities.SpecialFireCooldown <= 0) {
      p.abilities.SpecialFireCooldown = ABILITY.SPECIAL_COOLDOWN;
      const bs = 7.5;
      state.bullets.push({
        x: p.x + Math.cos(p.angle) * 24,
        y: p.y + Math.sin(p.angle) * 24,
        vx: Math.cos(p.angle) * bs,
        vy: Math.sin(p.angle) * bs,
        owner: p, color: p.color, life: 240,
        ricochet: true, bounces: ABILITY.SPECIAL_BOUNCES,
      });
      emit(state, 'vfx_special_muzzle', { x: p.x + Math.cos(p.angle) * 24, y: p.y + Math.sin(p.angle) * 24, angle: p.angle, color: p.color });
      emit(state, 'sfx_shoot', { x: p.x, y: p.y, pitch: 0.8 + Math.random() * 0.2 });
    }
  });

  for (let i = state.barricades.length - 1; i >= 0; i--) {
    const b = state.barricades[i];
    b.life -= dt / 1000;
    if (b.life <= 0) {
      emit(state, 'vfx_explosion', { x: b.x, y: b.y, color: '#9aa6b2', small: true });
      state.barricades.splice(i, 1);
    }
  }

  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    b.x += b.vx * f;
    b.y += b.vy * f;
    b.life -= f;
    let consumed = false;

    const blockers = [...state.walls, ...state.barricades];
    for (const rect of blockers) {
      if (!rectHit(b.x, b.y, 4, rect)) continue;
      if (b.ricochet && b.bounces > 0) {
        const axis = resolveRectCollision(b, rect, 4) || 'x';
        if (axis === 'x') b.vx = -b.vx;
        else b.vy = -b.vy;
        b.bounces -= 1;
        b.x = Math.max(4, Math.min(w - 4, b.x));
        b.y = Math.max(4, Math.min(h - 4, b.y));
        emit(state, 'sfx_ricochet', { x: b.x, y: b.y });
        emit(state, 'vfx_spark', { x: b.x, y: b.y, color: '#ffd166' });
        break;
      }
      if (Number.isFinite(rect.hp)) {
        rect.hp -= 25;
        if (rect.hp <= 0) {
          const idx = state.barricades.indexOf(rect);
          if (idx >= 0) {
            emit(state, 'vfx_explosion', { x: rect.x, y: rect.y, color: '#9aa6b2', small: true });
            state.barricades.splice(idx, 1);
          }
        }
      }
      emit(state, 'vfx_spark', { x: b.x, y: b.y, color: '#ffd166' });
      state.bullets.splice(i, 1);
      consumed = true;
      break;
    }
    if (consumed) continue;

    if (b.life <= 0 || b.x < 0 || b.x > w || b.y < 0 || b.y > h) {
      if (b.ricochet && b.bounces > 0) {
        if (b.x < 0 || b.x > w) b.vx = -b.vx;
        if (b.y < 0 || b.y > h) b.vy = -b.vy;
        b.x = Math.max(0, Math.min(w, b.x));
        b.y = Math.max(0, Math.min(h, b.y));
        b.bounces -= 1;
        emit(state, 'sfx_ricochet', { x: b.x, y: b.y });
        emit(state, 'vfx_spark', { x: b.x, y: b.y, color: '#ffd166' });
        continue;
      }
      state.bullets.splice(i, 1);
      continue;
    }

    for (const target of state.players) {
      if (!target.alive || target === b.owner) continue;
      if (!b.owner) continue;
      if (target.isDashing && b.owner.idx !== target.idx) continue;
      const dx = b.x - target.x;
      const dy = b.y - target.y;
      if (dx * dx + dy * dy < 18 * 18) {
        target.alive = false;
        target.respawn = 1500;
        b.owner.score += 1;
        state.bullets.splice(i, 1);
        emit(state, 'vfx_explosion', { x: target.x, y: target.y, color: target.color, big: true });
        emit(state, 'sfx_explosion', { x: target.x, y: target.y });
        state.shake = Math.min(1, state.shake + 0.9);
        break;
      }
    }
  }
  return state;
}

function createTTTState() {
  return {
    board: Array(9).fill(null),
    turn: 'X',
    cursor: 4,
    winner: null,
    lastMove: null,
    scores: { X: 0, O: 0 },
  };
}

function serializeTTT(state) {
  return {
    board: state.board.slice(),
    turn: state.turn,
    cursor: state.cursor,
    winner: state.winner,
    lastMove: state.lastMove,
    scores: { X: state.scores.X, O: state.scores.O },
  };
}

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function checkWinner(board) {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: [a, b, c] };
    }
  }
  if (board.every((cell) => cell)) return { winner: 'draw', line: null };
  return { winner: null, line: null };
}

function applyTTTAction(state, controllerId, action) {
  const mark = String(controllerId) === '1' ? 'X' : 'O';
  if (state.winner) {
    if (action === 'restart') {
      const next = createTTTState();
      next.scores = { X: state.scores.X, O: state.scores.O };
      return next;
    }
    return state;
  }
  if (action === 'place') {
    if (state.turn !== mark) return state;
    if (state.board[state.cursor]) return state;
    const board = state.board.slice();
    board[state.cursor] = mark;
    const { winner } = checkWinner(board);
    const next = {
      board,
      lastMove: state.cursor,
      winner,
      turn: state.turn === 'X' ? 'O' : 'X',
      cursor: state.cursor,
      scores: state.scores,
    };
    if (winner === 'X') next.scores = { ...state.scores, X: state.scores.X + 1 };
    if (winner === 'O') next.scores = { ...state.scores, O: state.scores.O + 1 };
    return next;
  }
  if (state.turn !== mark) return state;
  let cursor = state.cursor;
  if (action === 'up') cursor = cursor - 3 >= 0 ? cursor - 3 : cursor;
  else if (action === 'down') cursor = cursor + 3 <= 8 ? cursor + 3 : cursor;
  else if (action === 'left') cursor = cursor % 3 > 0 ? cursor - 1 : cursor;
  else if (action === 'right') cursor = cursor % 3 < 2 ? cursor + 1 : cursor;
  else return state;
  return { ...state, cursor };
}

export const GAME_REGISTRY = {
  TankDuel: {
    inputModel: 'keys',
    engine: {
      createInitialState: createTankState,
      serialize: serializeTank,
      step: stepTank,
    },
  },
  TicTacToe: {
    inputModel: 'actions',
    inputSchema: {
      up: 'up', down: 'down', left: 'left', right: 'right',
      a: 'place', b: 'restart', x: 'restart', y: 'place',
    },
    engine: {
      createInitialState: createTTTState,
      serialize: serializeTTT,
      applyAction: applyTTTAction,
    },
  },
};

export function getGameDef(name) {
  return GAME_REGISTRY[name] || null;
}

export function createInitialState(name, w, h) {
  const def = GAME_REGISTRY[name];
  if (!def || !def.engine || !def.engine.createInitialState) return null;
  if (name === 'TankDuel') return def.engine.createInitialState(w, h);
  return def.engine.createInitialState();
}

export function serialize(name, state) {
  const def = GAME_REGISTRY[name];
  if (!def || !def.engine || !def.engine.serialize) return state;
  return def.engine.serialize(state);
}

export function step(name, state, keys, dt) {
  const def = GAME_REGISTRY[name];
  if (!def || !def.engine || !def.engine.step) return state;
  return def.engine.step(state, keys, dt);
}
