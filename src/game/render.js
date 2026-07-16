// Draws a game state snapshot onto a 2D canvas context. Shared by host
// (which simulates) and clients (which receive snapshots). Coordinates in
// state are in the host's canvas pixel space; we scale to the local canvas.
//
// Visual overhaul (TankDuel_AI_Instructions*.md):
//   - Themed, textured industrial arena instead of a flat dark grid.
//   - Layered tank rendering: Hull (rotates with movement) + Turret (aims
//     independently), drawn as procedural sprites so it ships without art assets
//     while keeping the layered structure the spec calls for.
//   - Indestructible walls + destructible barricades.
//   - Ricochet rounds rendered with a glow halo.
// Particles & screen-shake are drawn by the injected VFX layer on top.
import { vfx } from './vfx.js';

export function renderState(ctx, canvas, state, opts = {}) {
  const w = canvas.width;
  const h = canvas.height;
  const vfxLayer = opts.vfx || vfx;
  const shake = (state.shake || 0);

  ctx.save();
  ctx.clearRect(0, 0, w, h);

  // --- Themed industrial battleground (full-bleed backdrop) ---
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#161b26');
  bg.addColorStop(1, '#0d1119');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // The simulation lives in a fixed state.w x state.h coordinate space. We map
  // that space onto the canvas with a SINGLE uniform scale and center it, so the
  // arena keeps its correct aspect ratio and stays centered no matter how the
  // window is sized (instead of stretching non-uniformly or drifting to the
  // top-left). All downstream draw code still uses sx/sy, so we set both to the
  // same letterboxed scale and translate into the centered arena box.
  const simW = state.w || w;
  const simH = state.h || h;
  const s = Math.min(w / simW, h / simH);
  const sx = s;
  const sy = s;
  const ox = (w - simW * s) / 2;
  const oy = (h - simH * s) / 2;
  ctx.translate(ox, oy);

  // Backdrop fill + texture only inside the actual arena box (so the playfield
  // reads as a distinct, correctly-proportioned surface on any canvas shape).
  const tile = Math.max(28, Math.round(40 * sx));
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, simW, simH); ctx.clip();
  const abg = ctx.createLinearGradient(0, 0, 0, simH);
  abg.addColorStop(0, '#161b26');
  abg.addColorStop(1, '#0d1119');
  ctx.fillStyle = abg;
  ctx.fillRect(0, 0, simW, simH);
  ctx.strokeStyle = '#ffffff08';
  ctx.lineWidth = 1;
  for (let x = 0; x < simW; x += tile) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, simH); ctx.stroke();
  }
  for (let y = 0; y < simH; y += tile) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(simW, y); ctx.stroke();
  }
  ctx.restore();
  // Faint hazard border.
  ctx.strokeStyle = '#ffb70322';
  ctx.lineWidth = Math.max(4, 6 * sx);
  ctx.strokeRect(2, 2, simW - 4, simH - 4);

  // --- Barricades (destructible) ---
  for (const b of state.barricades || []) {
    const bx = b.x * sx, by = b.y * sy;
    ctx.save();
    ctx.translate(bx, by);
    const dmg = 1 - Math.max(0, Math.min(1, (b.hp ?? 50) / 50));
    ctx.fillStyle = '#2b3140';
    ctx.fillRect(-14 * sx, -14 * sy, 28 * sx, 28 * sy);
    ctx.strokeStyle = dmg > 0.5 ? '#ff5d5d' : '#7c8aa0';
    ctx.lineWidth = 2;
    ctx.strokeRect(-14 * sx, -14 * sy, 28 * sx, 28 * sy);
    // cross-brace
    ctx.beginPath();
    ctx.moveTo(-14 * sx, -14 * sy); ctx.lineTo(14 * sx, 14 * sy);
    ctx.moveTo(14 * sx, -14 * sy); ctx.lineTo(-14 * sx, 14 * sy);
    ctx.stroke();
    if (dmg > 0) {
      ctx.globalAlpha = dmg * 0.5;
      ctx.fillStyle = '#ff5d5d';
      ctx.fillRect(-14 * sx, -14 * sy, 28 * sx, 28 * sy * dmg);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // --- Indestructible walls ---
  for (const wl of state.walls || []) {
    const wx = (wl.x - wl.w / 2) * sx;
    const wy = (wl.y - wl.h / 2) * sy;
    const ww = wl.w * sx, wh = wl.h * sy;
    const g = ctx.createLinearGradient(wx, wy, wx, wy + wh);
    g.addColorStop(0, '#3a4252');
    g.addColorStop(1, '#222836');
    ctx.fillStyle = g;
    ctx.fillRect(wx, wy, ww, wh);
    ctx.strokeStyle = '#0a0d14';
    ctx.lineWidth = 2;
    ctx.strokeRect(wx, wy, ww, wh);
    // rivets
    ctx.fillStyle = '#566077';
    const rv = 2 * sx;
    for (const [rx, ry] of [[wx + 5, wy + 5], [wx + ww - 5, wy + 5], [wx + 5, wy + wh - 5], [wx + ww - 5, wy + wh - 5]]) {
      ctx.beginPath(); ctx.arc(rx, ry, rv, 0, Math.PI * 2); ctx.fill();
    }
  }

  // --- Tanks (layered sprite) ---
  for (const p of state.players) {
    if (!p.alive) continue;
    drawTank(ctx, p.x * sx, p.y * sy, p.angle, p.turret ?? p.angle, p.color, sx, p.isDashing);
    // Exhaust trail when moving.
    if (p.moving) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#9aa6b2';
      const ex = p.x * sx - Math.cos(p.angle) * 16 * sx;
      const ey = p.y * sy - Math.sin(p.angle) * 16 * sx;
      ctx.beginPath(); ctx.arc(ex, ey, 4 * sx, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // --- Bullets ---
  for (const b of state.bullets || []) {
    const bx = b.x * sx, by = b.y * sy;
    if (b.ricochet) {
      ctx.save();
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 12 * sx;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(bx, by, 5 * sx, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.arc(bx, by, 2.5 * sx, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = b.color;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 6 * sx;
      ctx.beginPath(); ctx.arc(bx, by, 5 * sx, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  // --- Particles / screen shake (VFX layer) ---
  // VFX particles are spawned in arena coordinates, so they live inside the
  // same centered/uniformly-scaled transform as the playfield.
  vfxLayer.draw(ctx, opts.dtSec || 0.016, shake);

  // Leave the arena transform so the HUD sits in screen space (top corners of
  // the canvas), independent of the centered playfield box.
  ctx.restore();

  // --- HUD: scores + cooldown readouts ---
  drawHUD(ctx, w, h, state);
}

function drawTank(ctx, x, y, hullAngle, turretAngle, color, sx, dashing) {
  ctx.save();
  ctx.translate(x, y);

  // Dash glow halo.
  if (dashing) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 20 * sx;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(0, 0, 20 * sx, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Shadow.
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(2, 3, 18 * sx, 13 * sx, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // --- Hull layer (rotates with movement) ---
  ctx.save();
  ctx.rotate(hullAngle);
  const hw = 15 * sx, hh = 11 * sx;
  const hg = ctx.createLinearGradient(-hw, 0, hw, 0);
  hg.addColorStop(0, shade(color, -30));
  hg.addColorStop(0.5, color);
  hg.addColorStop(1, shade(color, 30));
  ctx.fillStyle = hg;
  roundRect(ctx, -hw, -hh, hw * 2, hh * 2, 4 * sx);
  ctx.fill();
  ctx.strokeStyle = '#0a0d14';
  ctx.lineWidth = 1.5;
  roundRect(ctx, -hw, -hh, hw * 2, hh * 2, 4 * sx);
  ctx.stroke();
  // treads
  ctx.fillStyle = '#11151d';
  ctx.fillRect(-hw, -hh - 2 * sx, hw * 2, 3 * sx);
  ctx.fillRect(-hw, hh - 1 * sx, hw * 2, 3 * sx);
  ctx.restore();

  // --- Turret layer (rotates independently to aim) ---
  ctx.save();
  ctx.rotate(turretAngle);
  // barrel
  ctx.fillStyle = '#cfd6e0';
  ctx.fillRect(6 * sx, -2.5 * sx, 18 * sx, 5 * sx);
  ctx.strokeStyle = '#0a0d14';
  ctx.strokeRect(6 * sx, -2.5 * sx, 18 * sx, 5 * sx);
  // turret dome
  const tg = ctx.createRadialGradient(-2 * sx, -2 * sx, 1, 0, 0, 11 * sx);
  tg.addColorStop(0, shade(color, 40));
  tg.addColorStop(1, shade(color, -10));
  ctx.fillStyle = tg;
  ctx.beginPath(); ctx.arc(0, 0, 8 * sx, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#0a0d14';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, 8 * sx, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();

  ctx.restore();
}

function drawHUD(ctx, w, h, state) {
  ctx.save();
  ctx.textBaseline = 'top';
  const pad = Math.max(12, 16);
  const fScore = Math.max(16, w * 0.022);
  const fCD = Math.max(11, w * 0.013);

  const players = state.players || [];
  players.forEach((p, i) => {
    const isLeft = i === 0;
    ctx.textAlign = isLeft ? 'left' : 'right';
    const ax = isLeft ? pad : w - pad;

    // Player label + score
    ctx.fillStyle = p.color;
    ctx.font = `700 ${fScore}px system-ui`;
    ctx.fillText(`P${i + 1}  ${p.score}`, ax, pad);

    // Cooldown pills. The live (host) player stores cooldowns on
    // `abilities.{Dash,Mine,SpecialFire}Cooldown`, while a serialized snapshot
    // (sent to clients) flattens them onto `dash`/`mine`/`special`. Read from
    // whichever shape this state uses so the HUD is correct on BOTH the host
    // main window and the remote controllers.
    const ab = p.abilities || {};
    // `max` is each ability's full cooldown (ABILITY.* in engine.js) so the
    // fill bar scales correctly per ability. The previous code used a fixed
    // `c.v > 5 ? 8 : 3` divisor that didn't match the real durations, which
    // made Mine (8s) appear to reset and refill halfway through its cooldown.
    const cds = [
      { label: 'DASH', v: p.dash ?? ab.DashCooldown ?? 0, max: 3 },
      { label: 'MINE', v: p.mine ?? ab.MineCooldown ?? 0, max: 8 },
      { label: 'RICO', v: p.special ?? ab.SpecialFireCooldown ?? 0, max: 5 },
    ];
    let cy = pad + fScore + 6;
    const pillW = Math.max(64, w * 0.09);
    const pillH = fCD + 8;
    for (const c of cds) {
      const px = isLeft ? ax : ax - pillW;
      ctx.fillStyle = '#0d111900';
      roundRect(ctx, px, cy, pillW, pillH, 6);
      ctx.fillStyle = '#0d1119cc';
      roundRect(ctx, px, cy, pillW, pillH, 6); ctx.fill();
      ctx.strokeStyle = '#ffffff15';
      roundRect(ctx, px, cy, pillW, pillH, 6); ctx.stroke();
      // fill bar
      const ready = c.v <= 0;
      const frac = ready ? 1 : 1 - Math.min(1, c.v / (c.max || 1));
      ctx.fillStyle = ready ? '#3ddc84' : '#ffb703';
      roundRect(ctx, px + 3, cy + 3, (pillW - 6) * frac, pillH - 6, 4); ctx.fill();
      ctx.fillStyle = ready ? '#06240f' : '#2a1c00';
      ctx.font = `600 ${fCD}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(`${c.label} ${ready ? '✓' : c.v.toFixed(1)}`, px + pillW / 2, cy + 4);
      ctx.textAlign = isLeft ? 'left' : 'right';
      cy += pillH + 5;
    }
  });
  ctx.restore();

  // Respawn notices.
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8b98a9';
  ctx.font = `${Math.max(13, w * 0.016)}px system-ui`;
  if (players[0] && !players[0].alive) ctx.fillText('P1 respawning…', w * 0.3, h * 0.5);
  if (players[1] && !players[1].alive) ctx.fillText('P2 respawning…', w * 0.7, h * 0.5);
  ctx.restore();
}

// Rounded-rect path helper (no comments per house style).
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Lighten/darken a hex color by amt (-255..255).
function shade(hex, amt) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const c = [1, 2, 3].map((i) => Math.max(0, Math.min(255, parseInt(m[i], 16) + amt)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
