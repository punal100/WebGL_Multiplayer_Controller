// Standalone VFX layer. Listens to game events (emitted by the engine over
// `state.events`) and spawns transient particles / screen-shake. It NEVER
// touches game state — pure visual feedback, per the decoupled-event spec.
//
// Particle categories baked into the spec:
//   vfx_dash        -> ghosting trail behind a dashing tank
//   vfx_muzzle      -> muzzle flash at the turret tip
//   vfx_special_muzzle -> brighter muzzle flash for the ricochet round
//   vfx_spark       -> metallic sparks when a round strikes a wall
//   vfx_explosion   -> 3 layered explosion (flash + debris + smoke)

class VFXManager {
  constructor() {
    this.particles = [];
  }

  clear() {
    this.particles.length = 0;
  }

  // Consume one engine frame's worth of events.
  handleEvents(events, sx = 1, sy = 1) {
    if (!events) return;
    for (const e of events) {
      const x = (e.x ?? 0) * sx;
      const y = (e.y ?? 0) * sy;
      switch (e.type) {
        case 'vfx_dash':
          this.spawnDash(x, y, e.color);
          break;
        case 'vfx_muzzle':
          this.spawnMuzzle(x, y, e.angle ?? 0, e.color, 12, 0.18);
          break;
        case 'vfx_special_muzzle':
          this.spawnMuzzle(x, y, e.angle ?? 0, e.color, 18, 0.35);
          break;
        case 'vfx_spark':
          this.spawnSparks(x, y, e.color || '#ffd166', 6);
          break;
        case 'vfx_explosion':
          this.spawnExplosion(x, y, e.color || '#ffae42', e.big, e.small);
          break;
        default:
          break;
      }
    }
  }

  spawnDash(x, y, color) {
    this.particles.push({
      kind: 'ghost', x, y, r: 16, life: 0.35, maxLife: 0.35, color,
    });
  }

  spawnMuzzle(x, y, angle, color, count, life) {
    this.particles.push({
      kind: 'flash', x, y, r: 14, life, maxLife: life, color,
    });
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * 0.5;
      const sp = 1.5 + Math.random() * 2.5;
      this.particles.push({
        kind: 'spark', x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: 1.5 + Math.random() * 1.5, life: 0.25, maxLife: 0.25,
        color: '#ffe08a', grav: 0,
      });
    }
  }

  spawnSparks(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 3;
      this.particles.push({
        kind: 'spark', x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: 1 + Math.random() * 1.5, life: 0.3, maxLife: 0.3,
        color, grav: 0.05,
      });
    }
  }

  spawnExplosion(x, y, color, big, small) {
    const s = big ? 1.7 : small ? 0.7 : 1;
    this.particles.push({
      kind: 'flash', x, y, r: 30 * s, life: 0.4, maxLife: 0.4, color: '#ffffff',
    });
    // Layer 2: 15 orange squares with gravity (+ more for big booms)
    const n = big ? 26 : 15;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (1 + Math.random() * 4) * s;
      this.particles.push({
        kind: 'debris', x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: 2 + Math.random() * 3 * s, life: 0.5 + Math.random() * 0.3,
        maxLife: 0.8, color: i % 2 ? '#ff7b00' : '#ffd166', grav: 0.12,
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
      });
    }
    // Layer 3: 5 gray smoke circles, slow expanding
    const m = big ? 9 : 5;
    for (let i = 0; i < m; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.3 + Math.random() * 1.2) * s;
      this.particles.push({
        kind: 'smoke', x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.3,
        r: 8 * s, grow: 0.5 + Math.random() * 0.6,
        life: 0.8 + Math.random() * 0.5, maxLife: 1.3,
        color: 'rgba(150,150,160,0.5)',
      });
    }
  }

  // Advance + draw all particles. `shake` (0..1) offsets the whole canvas and
  // `scale` (uniform letterbox scale) maps the arena-space particle coords onto
  // the canvas so particles line up exactly with the world (tanks/bullets), which
  // renderState draws scaled by the same `scale`. Without this, particles were
  // drawn at raw arena coordinates while the world was scaled by `scale`, so on
  // any canvas whose aspect/size differs from the 1280x720 arena (i.e. every
  // client, controller, or differently-shaped window) VFX such as the muzzle
  // flash appeared offset toward the corner instead of at the firing tank.
  draw(ctx, dtSec, shake = 0, scale = 1) {
    let ox = 0, oy = 0;
    if (shake > 0) {
      ox = (Math.random() * 10 - 5) * shake;
      oy = (Math.random() * 10 - 5) * shake;
    }
    ctx.save();
    ctx.translate(ox, oy);
    if (scale !== 1) ctx.scale(scale, scale);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dtSec;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      // Guard against any non-finite coordinate/radius (e.g. a snapshot that
      // was scaled by a zero-sized canvas) so a single bad particle can never
      // throw inside the canvas API and kill the whole render loop.
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.r) || p.r <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const t = p.life / p.maxLife; // 1 -> 0
      ctx.save();
      switch (p.kind) {
        case 'ghost': {
          ctx.globalAlpha = t * 0.5;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'flash': {
          ctx.globalAlpha = t;
          const rr = Math.max(1, p.r * (1.4 - t * 0.4));
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
          g.addColorStop(0, '#ffffff');
          g.addColorStop(0.4, p.color);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'spark': {
          if (p.grav) p.vy += p.grav;
          p.x += p.vx; p.y += p.vy;
          ctx.globalAlpha = t;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'debris': {
          p.vy += p.grav;
          p.x += p.vx; p.y += p.vy; p.rot += p.vr;
          ctx.globalAlpha = Math.min(1, t * 1.4);
          ctx.fillStyle = p.color;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
          break;
        }
        case 'smoke': {
          p.x += p.vx; p.y += p.vy; p.r += p.grow;
          ctx.globalAlpha = t * 0.5;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        default:
          break;
      }
      ctx.restore();
    }
    ctx.restore();
  }
}

export const vfx = new VFXManager();
export default VFXManager;
