// Authoritative game simulation. Pure logic: given a Set of currently-held
// keys, advance state by dt (ms) and return a serializable snapshot.
// Runs ONLY on the host. Controllers receive snapshots and just render them.
//
// Per the Tank Duel overhaul directives (TankDuel_AI_Instructions*.md) this
// engine now owns three new abilities, destructible/indestructible walls, a
// decoupled event bus, and a screen-shake trigger. The render + audio + vfx
// layers all consume `state.events` — the core loop never draws or plays sound.

// Static per-player control mappings. Kept OUT of the serialized state so
// resumed/persisted snapshots (which omit it) still simulate correctly.
export const PLAYER_CONTROLS = [
  { up: 'w', down: 's', left: 'a', right: 'd', fire: 'q', dash: 'e', mine: 'r', special: 'f' },
  { up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright', fire: ',', dash: '.', mine: '/', special: "'" },
];

// Ability tuning constants (seconds).
export const ABILITY = {
  DASH_DURATION: 0.2,
  DASH_COOLDOWN: 3.0,
  DASH_MULTIPLIER: 3.0,
  MINE_COOLDOWN: 8.0,
  MINE_HEALTH: 50,
  MINE_LIFETIME: 20, // seconds before a barricade rusts away
  SPECIAL_COOLDOWN: 5.0,
  SPECIAL_BOUNCES: 2,
  FIRE_COOLDOWN: 28,
};

function makePlayer(x, y, angle, color, idx) {
  return {
    idx,
    x,
    y,
    angle, // hull rotation (drives & aims on this simple build)
    turret: angle, // independent turret rotation (V2 layered-sprite spec)
    color,
    cooldown: 0,
    score: 0,
    alive: true,
    respawn: 0,
    // Ability state (V2 exact structures)
    abilities: {
      DashCooldown: 0,
      MineCooldown: 0,
      SpecialFireCooldown: 0,
    },
    isDashing: false,
    dashTimer: 0,
    moving: false,
  };
}

// Fill in any fields a snapshot might be missing (e.g. an older persisted
// state from before the ability/wall overhaul). Keeps the sim crash-proof
// when resuming from the server.
function hydrate(state) {
  if (!state) return state;
  if (!Array.isArray(state.walls)) state.walls = [];
  if (!Array.isArray(state.barricades)) state.barricades = [];
  if (!Array.isArray(state.bullets)) state.bullets = [];
  if (!Array.isArray(state.events)) state.events = [];
  if (typeof state.shake !== 'number') state.shake = 0;
  if (!Array.isArray(state.players)) return state;
  state.players.forEach((p, i) => {
    if (!p.abilities) p.abilities = { DashCooldown: 0, MineCooldown: 0, SpecialFireCooldown: 0 };
    if (typeof p.abilities.DashCooldown !== 'number') p.abilities.DashCooldown = 0;
    if (typeof p.abilities.MineCooldown !== 'number') p.abilities.MineCooldown = 0;
    if (typeof p.abilities.SpecialFireCooldown !== 'number') p.abilities.SpecialFireCooldown = 0;
    if (typeof p.turret !== 'number') p.turret = p.angle || 0;
    if (typeof p.isDashing !== 'boolean') p.isDashing = false;
    if (typeof p.dashTimer !== 'number') p.dashTimer = 0;
    if (typeof p.moving !== 'boolean') p.moving = false;
    if (typeof p.idx !== 'number') p.idx = i;
  });
  return state;
}

export function createInitialState(w, h) {
  const state = {
    w,
    h,
    players: [
      makePlayer(w * 0.3, h * 0.5, 0, '#4cc9f0', 0),
      makePlayer(w * 0.7, h * 0.5, Math.PI, '#f72585', 1),
    ],
    bullets: [],
    barricades: [],
    walls: [
      // Indestructible arena fixtures (choke points for bouncing rounds)
      { x: w * 0.5, y: h * 0.28, w: 70, h: 18, hp: Infinity },
      { x: w * 0.5, y: h * 0.72, w: 70, h: 18, hp: Infinity },
      { x: w * 0.22, y: h * 0.5, w: 18, h: 90, hp: Infinity },
      { x: w * 0.78, y: h * 0.5, w: 18, h: 90, hp: Infinity },
    ],
    events: [], // transient frame events for vfx/audio/screenshake
    shake: 0, // remaining screen-shake intensity (0..1)
  };
  return state;
}

// Flush and return the accumulated events for this frame. The renderer/audio
// consume these and then call clearEvents so they don't replay next frame.
function emit(state, type, data) {
  state.events.push({ type, ...data });
}

export function serialize(state) {
  return {
    w: state.w,
    h: state.h,
    players: state.players.map((p) => ({
      idx: p.idx,
      x: Math.round(p.x),
      y: Math.round(p.y),
      angle: +p.angle.toFixed(3),
      turret: +p.turret.toFixed(3),
      score: p.score,
      alive: p.alive,
      color: p.color,
      cooldown: p.cooldown,
      respawn: p.respawn,
      moving: p.moving,
      isDashing: p.isDashing,
      dash: +p.abilities.DashCooldown.toFixed(2),
      mine: +p.abilities.MineCooldown.toFixed(2),
      special: +p.abilities.SpecialFireCooldown.toFixed(2),
    })),
    bullets: state.bullets.map((b) => ({
      x: Math.round(b.x),
      y: Math.round(b.y),
      color: b.color,
      ricochet: !!b.ricochet,
      bounces: b.bounces,
    })),
    barricades: state.barricades.map((m) => ({
      x: Math.round(m.x),
      y: Math.round(m.y),
      hp: m.hp,
    })),
    walls: state.walls.map((wl) => ({ x: wl.x, y: wl.y, w: wl.w, h: wl.h })),
    shake: +state.shake.toFixed(3),
    // Transient events for this frame so viewers/clients can replay VFX+audio.
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

export function step(state, keys, dt) {
  state = hydrate(state);
  const w = state.w;
  const h = state.h;
  const f = dt / 16; // frame-normalized step (1 == 16ms)
  const turn = 0.045 * f;
  const speed = 2.2 * f;

  // Decay screen shake.
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

    // --- Cooldowns ---
    if (p.abilities.DashCooldown > 0) p.abilities.DashCooldown = Math.max(0, p.abilities.DashCooldown - dt / 1000);
    if (p.abilities.MineCooldown > 0) p.abilities.MineCooldown = Math.max(0, p.abilities.MineCooldown - dt / 1000);
    if (p.abilities.SpecialFireCooldown > 0) p.abilities.SpecialFireCooldown = Math.max(0, p.abilities.SpecialFireCooldown - dt / 1000);
    if (p.cooldown > 0) p.cooldown -= dt / 16;
    if (p.isDashing) {
      p.dashTimer -= dt / 1000;
      if (p.dashTimer <= 0) p.isDashing = false;
    }

    // --- Steering ---
    if (keys.has(c.left)) p.angle -= turn;
    if (keys.has(c.right)) p.angle += turn;
    // Turret aims opposite stick / independent: for keyboard we let the
    // same WASD drive hull and turret tracks hull, but allow fire to lead.
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

    // Keep inside arena + collide with walls/barricades.
    p.x = Math.max(16, Math.min(w - 16, p.x));
    p.y = Math.max(16, Math.min(h - 16, p.y));
    for (const wl of state.walls) resolveRectCollision(p, wl, 14);
    for (const b of state.barricades) resolveRectCollision(p, b, 14);

    // --- Ability 1: Dash / Evade ---
    if (keys.has(c.dash) && p.abilities.DashCooldown <= 0 && !p.isDashing) {
      p.isDashing = true;
      p.dashTimer = ABILITY.DASH_DURATION;
      p.abilities.DashCooldown = ABILITY.DASH_COOLDOWN;
      emit(state, 'vfx_dash', { x: p.x, y: p.y, color: p.color });
    }

    // --- Ability 2: Deployable Barricade ---
    if (keys.has(c.mine) && p.abilities.MineCooldown <= 0) {
      const bx = p.x - Math.cos(p.angle) * 50;
      const by = p.y - Math.sin(p.angle) * 50;
      state.barricades.push({
        x: bx,
        y: by,
        w: 28,
        h: 28,
        hp: ABILITY.MINE_HEALTH,
        life: ABILITY.MINE_LIFETIME,
        owner: p.idx,
      });
      p.abilities.MineCooldown = ABILITY.MINE_COOLDOWN;
      emit(state, 'sfx_deploy', { x: bx, y: by });
    }

    // --- Fire (normal round) ---
    if (keys.has(c.fire) && p.cooldown <= 0) {
      p.cooldown = ABILITY.FIRE_COOLDOWN;
      const bs = 7;
      state.bullets.push({
        x: p.x + Math.cos(p.angle) * 24,
        y: p.y + Math.sin(p.angle) * 24,
        vx: Math.cos(p.angle) * bs,
        vy: Math.sin(p.angle) * bs,
        owner: p,
        color: p.color,
        life: 120,
        ricochet: false,
        bounces: 0,
      });
      emit(state, 'sfx_shoot', { x: p.x, y: p.y, pitch: 0.9 + Math.random() * 0.2 });
      emit(state, 'vfx_muzzle', { x: p.x + Math.cos(p.angle) * 24, y: p.y + Math.sin(p.angle) * 24, angle: p.angle, color: p.color });
    }

    // --- Ability 3: Special Ricochet Round ---
    if (keys.has(c.special) && p.abilities.SpecialFireCooldown <= 0) {
      p.abilities.SpecialFireCooldown = ABILITY.SPECIAL_COOLDOWN;
      const bs = 7.5;
      state.bullets.push({
        x: p.x + Math.cos(p.angle) * 24,
        y: p.y + Math.sin(p.angle) * 24,
        vx: Math.cos(p.angle) * bs,
        vy: Math.sin(p.angle) * bs,
        owner: p,
        color: p.color,
        life: 240,
        ricochet: true,
        bounces: ABILITY.SPECIAL_BOUNCES,
      });
      emit(state, 'vfx_special_muzzle', { x: p.x + Math.cos(p.angle) * 24, y: p.y + Math.sin(p.angle) * 24, angle: p.angle, color: p.color });
      emit(state, 'sfx_shoot', { x: p.x, y: p.y, pitch: 0.8 + Math.random() * 0.2 });
    }
  });

  // --- Barricade aging ---
  for (let i = state.barricades.length - 1; i >= 0; i--) {
    const b = state.barricades[i];
    b.life -= dt / 1000;
    if (b.life <= 0) {
      emit(state, 'vfx_explosion', { x: b.x, y: b.y, color: '#9aa6b2', small: true });
      state.barricades.splice(i, 1);
    }
  }

  // --- Bullets ---
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    b.x += b.vx * f;
    b.y += b.vy * f;
    b.life -= f;

    let consumed = false;

    // Wall / barricade collision (ricochet reflects the velocity vector).
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
      // Destructible barricade takes damage; non-ricochet & ricochet-out
      // bullets both detonate on solids.
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
      // Ricochet rounds bounce off arena edges too.
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

    // Tank hit. A tank that is currently dashing phases through enemy
    // projectiles (V2: "Ignore collision with enemy projectiles while
    // IsDashing == true"). Its own shots still kill normally.
    // Bullets loaded from a serialized snapshot carry no live `owner`
    // reference, so we skip them here — they'll simply expire.
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

export function consumeEvents(state) {
  const ev = state.events;
  state.events = [];
  return ev;
}
