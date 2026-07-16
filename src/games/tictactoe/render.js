// Draws a Tic-Tac-Toe snapshot onto a 2D canvas context. Shares the same
// contract as TankDuel's renderer: (ctx, canvas, state). Coordinates are
// derived from the canvas size so it scales to any host/controller view.
const MARK = { X: '#4cc9f0', O: '#f72585' };

export function renderState(ctx, canvas, state) {
  const w = canvas.width;
  const h = canvas.height;
  const size = Math.min(w, h);
  const board = size * 0.86;
  const ox = (w - board) / 2;
  const oy = (h - board) / 2;
  const cell = board / 3;

  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(0, 0, w, h);

  // Board background
  ctx.fillStyle = '#10151f';
  ctx.fillRect(ox, oy, board, board);

  // Grid lines
  ctx.strokeStyle = '#2a3344';
  ctx.lineWidth = Math.max(2, board * 0.012);
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(ox + cell * i, oy);
    ctx.lineTo(ox + cell * i, oy + board);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ox, oy + cell * i);
    ctx.lineTo(ox + board, oy + cell * i);
    ctx.stroke();
  }

  // Cells (marks + cursor + last-move highlight)
  const lw = checkLine(state);
  for (let i = 0; i < 9; i++) {
    const cx = ox + (i % 3) * cell;
    const cy = oy + Math.floor(i / 3) * cell;
    const pad = cell * 0.16;

    if (state.lastMove === i && !state.winner) {
      ctx.fillStyle = '#ffffff10';
      ctx.fillRect(cx, cy, cell, cell);
    }
    if (lw && lw.includes(i)) {
      ctx.fillStyle = '#3ddc8422';
      ctx.fillRect(cx, cy, cell, cell);
    }
    const mark = state.board[i];
    if (mark) drawMark(ctx, mark, cx + cell / 2, cy + cell / 2, cell * 0.62);

    // Cursor highlight (only while the game is in progress)
    if (i === state.cursor && !state.winner) {
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = Math.max(3, cell * 0.06);
      ctx.strokeRect(cx + pad, cy + pad, cell - pad * 2, cell - pad * 2);
    }
  }

  // Status banner
  const font = Math.max(14, w * 0.026);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e6edf3';
  ctx.font = `${font}px system-ui`;
  let msg;
  if (state.winner === 'draw') msg = "Draw — press Restart";
  else if (state.winner) msg = `${state.winner} wins! — press Restart`;
  else msg = `Turn: ${state.turn}`;
  ctx.fillText(msg, w / 2, oy - Math.max(10, board * 0.05));

  // Scores
  ctx.font = `${Math.max(12, w * 0.02)}px system-ui`;
  ctx.textAlign = 'left';
  ctx.fillStyle = MARK.X;
  ctx.fillText(`X ${state.scores.X}`, ox, oy + board + font * 1.6);
  ctx.textAlign = 'right';
  ctx.fillStyle = MARK.O;
  ctx.fillText(`O ${state.scores.O}`, ox + board, oy + board + font * 1.6);
}

function checkLine(state) {
  const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  if (!state.winner || state.winner === 'draw') return null;
  for (const [a, b, c] of LINES) {
    if (state.board[a] === state.winner && state.board[b] === state.winner && state.board[c] === state.winner) {
      return [a, b, c];
    }
  }
  return null;
}

function drawMark(ctx, mark, x, y, s) {
  ctx.strokeStyle = MARK[mark];
  ctx.lineWidth = Math.max(4, s * 0.12);
  ctx.lineCap = 'round';
  const r = s / 2;
  if (mark === 'X') {
    ctx.beginPath();
    ctx.moveTo(x - r, y - r);
    ctx.lineTo(x + r, y + r);
    ctx.moveTo(x + r, y - r);
    ctx.lineTo(x - r, y + r);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}
