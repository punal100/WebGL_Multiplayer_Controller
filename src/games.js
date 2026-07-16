// Games exposed by the controller hub. The authoritative list lives in
// src/games/registry.js (which also carries each game's engine, renderer, and
// input model). This file re-exports it so existing imports keep working and
// the landing page / server URLs stay in sync.
export {
  GAMES,
  GAME_NAMES,
  GAME_REGISTRY,
  getGame,
  getGameDef,
} from './games/registry.js';

export const DEFAULT_GAME = 'TankDuel';
