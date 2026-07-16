// Draws a game state snapshot onto a 2D canvas context. Shared by host
// (which simulates) and clients (which receive snapshots). Coordinates in
// state are in the host's canvas pixel space; we scale to the local canvas.
export function renderState(ctx, canvas, state) {
  const w = canvas.width;
  const h = canvas.height;
  const sx = w / (state.w || w);
  const sy = h / (state.h || h);

  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(0, 0, w, h);

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

  for (const p of state.players) {
    if (!p.alive) continue;
    ctx.save();
    ctx.translate(p.x * sx, p.y * sy);
    ctx.rotate(p.angle);
    ctx.fillStyle = p.color;
    ctx.fillRect(-14, -10, 28, 20);
    ctx.fillStyle = '#fff';
    ctx.fillRect(10, -3, 16, 6);
    ctx.restore();
  }

  for (const b of state.bullets) {
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(b.x * sx, b.y * sy, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#e6edf3';
  ctx.font = `${Math.max(16, w * 0.025)}px system-ui`;
  ctx.textAlign = 'left';
  ctx.fillText(`P1: ${state.players[0].score}`, 16, 34);
  ctx.textAlign = 'right';
  ctx.fillText(`P2: ${state.players[1].score}`, w - 16, 34);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#8b98a9';
  ctx.font = `${Math.max(13, w * 0.018)}px system-ui`;
  if (!state.players[0].alive) ctx.fillText('P1 respawn…', w * 0.3, h * 0.5);
  if (!state.players[1].alive) ctx.fillText('P2 respawn…', w * 0.7, h * 0.5);
}
