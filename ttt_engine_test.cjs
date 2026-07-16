const { createInitialState, applyAction } = require('./src/games/tictactoe/engine.js');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok:', msg);
}

const { createInitialState, applyAction } = require('./src/games/tictactoe/engine.js');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok:', msg);
}

// Navigate the shared cursor to a target index using only legal moves, then
// place a mark for the given player. Returns the resulting state.
function gotoAndPlace(s, player, idx) {
  let guard = 0;
  while (s.cursor !== idx && guard++ < 20) {
    const row = Math.floor(s.cursor / 3), col = s.cursor % 3;
    const tRow = Math.floor(idx / 3), tCol = idx % 3;
    if (row > tRow) s = applyAction(s, player, 'up');
    else if (row < tRow) s = applyAction(s, player, 'down');
    else if (col > tCol) s = applyAction(s, player, 'left');
    else if (col < tCol) s = applyAction(s, player, 'right');
  }
  return applyAction(s, player, 'place');
}

// ---- Win path: X takes top row (0,1,2) ----
let s = createInitialState();
s = gotoAndPlace(s, '1', 0); // X@0, turn O
assert(s.board[0] === 'X', 'X placed at 0');
s = gotoAndPlace(s, '2', 3); // O@3, turn X
assert(s.board[3] === 'O', 'O placed at 3');
s = gotoAndPlace(s, '1', 1); // X@1, turn O
assert(s.board[1] === 'X', 'X placed at 1');
s = gotoAndPlace(s, '2', 4); // O@4, turn X
assert(s.board[4] === 'O', 'O placed at 4');
s = gotoAndPlace(s, '1', 2); // X@2 -> win row 0,1,2
assert(s.board[2] === 'X' && s.winner === 'X', 'X wins top row, got winner=' + s.winner + ' board=' + s.board.map((c) => c || '.').join(''));
assert(s.scores.X === 1, 'X match score = 1, got ' + s.scores.X);

// After win: place ignored, restart clears board but keeps score
const snap = JSON.stringify(s.board);
s = applyAction(s, '1', 'place');
assert(JSON.stringify(s.board) === snap, 'no move after win');
s = applyAction(s, '1', 'restart');
assert(s.winner === null && s.board.every((c) => c === null), 'restart clears board');
assert(s.scores.X === 1, 'restart keeps match score');

// ---- Turn enforcement ----
let t = createInitialState();
t = applyAction(t, '1', 'place'); // X@4, turn O
const before = JSON.stringify(t.board);
t = applyAction(t, '1', 'place'); // X tries again on O's turn
assert(JSON.stringify(t.board) === before, 'X blocked during O turn');

// ---- Occupied-cell guard ----
let o = createInitialState();
o = applyAction(o, '1', 'place');      // X@4, turn O
o = applyAction(o, '2', 'up'); o = applyAction(o, '2', 'place'); // O@1, turn X
const ob = JSON.stringify(o.board);
o = applyAction(o, '1', 'up'); o = applyAction(o, '1', 'place'); // X tries 1 (occupied) -> blocked
assert(JSON.stringify(o.board) === ob, 'cannot place on occupied cell');

// ---- Cursor clamps at edges ----
let m = createInitialState();
m = applyAction(m, '1', 'up');   // 4->1
m = applyAction(m, '1', 'up');   // 1->0 (top, clamp)
m = applyAction(m, '1', 'up');   // stays 0
assert(m.cursor === 0, 'cursor clamps at top edge');
m = applyAction(m, '1', 'left'); // 0 stays (left clamp)
assert(m.cursor === 0, 'cursor clamps at left edge');
m = applyAction(m, '1', 'down'); m = applyAction(m, '1', 'down'); m = applyAction(m, '1', 'down'); // 0->3->6->6 (bottom clamp)
assert(m.cursor === 6, 'cursor clamps at bottom edge');

console.log('\nTICTACTOE ENGINE TESTS DONE');
