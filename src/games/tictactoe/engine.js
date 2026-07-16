// Real, two-player Tic-Tac-Toe. Turn-based: players move a cursor and place
// their mark. The authoritative host applies actions (from controllers or the
// host keyboard) to this state and broadcasts snapshots — exactly like
// TankDuel, but with discrete actions instead of held keys.

export function createInitialState() {
  return {
    board: Array(9).fill(null), // null | 'X' | 'O'
    turn: 'X', // whose turn it is
    cursor: 4, // index 0..8 of the highlighted cell
    winner: null, // null | 'X' | 'O' | 'draw'
    lastMove: null, // index of the last placed mark (for highlight)
    scores: { X: 0, O: 0 }, // running match score across rounds
  };
}

export function serialize(state) {
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

// Apply a discrete action from a player (controllerId 1 -> X, 2 -> O).
// Returns a NEW state (does not mutate the input). Invalid actions (wrong
// turn, cell taken, game over) are ignored and the state is returned unchanged.
export function applyAction(state, controllerId, action) {
  const mark = controllerId === '1' || controllerId === 1 ? 'X' : 'O';

  // Can't act if the game is already decided.
  if (state.winner) {
    // Only "restart" is allowed once a round is finished.
    if (action === 'restart') {
      const next = createInitialState();
      next.scores = { ...state.scores };
      return next;
    }
    return state;
  }

  // Only the player whose turn it is may place a mark.
  if (action === 'place') {
    if (state.turn !== mark) return state;
    if (state.board[state.cursor]) return state;
    const board = state.board.slice();
    board[state.cursor] = mark;
    const { winner } = checkWinner(board);
    const next = {
      ...state,
      board,
      lastMove: state.cursor,
      winner,
      turn: state.turn === 'X' ? 'O' : 'X',
    };
    if (winner === 'X') next.scores = { ...state.scores, X: state.scores.X + 1 };
    if (winner === 'O') next.scores = { ...state.scores, O: state.scores.O + 1 };
    return next;
  }

  // Movement is allowed by either player (it only moves the shared cursor);
  // keeping it free-form feels better on a shared board, but we still gate it
  // to the active player to avoid "cursor wars".
  if (state.turn !== mark) return state;
  let cursor = state.cursor;
  if (action === 'up') cursor = cursor - 3 >= 0 ? cursor - 3 : cursor;
  else if (action === 'down') cursor = cursor + 3 <= 8 ? cursor + 3 : cursor;
  else if (action === 'left') cursor = cursor % 3 > 0 ? cursor - 1 : cursor;
  else if (action === 'right') cursor = cursor % 3 < 2 ? cursor + 1 : cursor;
  else return state;

  return { ...state, cursor };
}

// Apply a host-keyboard action (used when the host presses keys directly,
// without a controller). Same rules as controller actions.
export function applyKeyAction(state, key, controllerId) {
  const map = {
    w: 'up', s: 'down', a: 'left', d: 'right',
    arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right',
    ' ': 'place', enter: 'place', q: 'restart', e: 'restart',
  };
  const action = map[key.toLowerCase()];
  if (!action) return state;
  return applyAction(state, controllerId || '1', action);
}
