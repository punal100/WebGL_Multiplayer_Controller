// Central registry of every game the hub can host. Each entry declares:
//   - engine: { createInitialState, serialize, applyAction?, applyKeyAction? }
//   - render: draws a state snapshot onto a canvas
//   - inputModel: 'keys'    -> controller buttons become synthetic keyboard
//                             events (real-time games like TankDuel)
//                 'actions' -> controller buttons map to discrete game actions
//                             applied directly to the authoritative state
//                             (turn-based games like TicTacToe)
//   - inputSchema: maps a controller button -> game action (for 'actions' games)
//
// Adding a new game = drop an engine+render module and register it here. The
// host/controller screens adapt automatically via `inputModel`.

import * as tankEngine from '../game/engine.js';
import * as tankRender from '../game/render.js';
import * as tttEngine from './tictactoe/engine.js';
import * as tttRender from './tictactoe/render.js';

// Per-player button -> action mapping for 'actions' games. Identical for both
// players (each moves the shared cursor on their turn and places their mark).
const TTT_SCHEMA = {
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  a: 'place', // primary action: place mark
  b: 'restart',
  x: 'restart',
  y: 'place',
};

export const GAME_REGISTRY = {
  TankDuel: {
    title: 'Tank Duel',
    tagline: 'Top-down 2-player tank shooter',
    players: 2,
    inputModel: 'keys',
    engine: tankEngine,
    render: tankRender.renderState,
  },
  TicTacToe: {
    title: 'Tic Tac Toe',
    tagline: 'Classic 3x3 duel — take turns to win',
    players: 2,
    inputModel: 'actions',
    inputSchema: TTT_SCHEMA,
    engine: tttEngine,
    render: tttRender.renderState,
  },
};

export const GAMES = Object.entries(GAME_REGISTRY).map(([name, def]) => ({
  name,
  title: def.title,
  tagline: def.tagline,
  players: def.players,
}));

export const GAME_NAMES = GAMES.map((g) => g.name);

export function getGameDef(name) {
  return GAME_REGISTRY[name] || null;
}

export function getGame(name) {
  return GAMES.find((g) => g.name === name) || null;
}
