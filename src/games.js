// Registry of games exposed by the controller hub. Adding a game here makes
// it selectable on the landing page and keeps every other screen (host,
// controller, server URLs) in sync via the single GAME_NAMES list.
export const GAMES = [
  {
    name: 'TankDuel',
    title: 'Tank Duel',
    tagline: 'Top-down 2-player tank shooter',
    players: 2,
  },
];

// Convenience list of game names used for routing/validation.
export const GAME_NAMES = GAMES.map((g) => g.name);

export function getGame(name) {
  return GAMES.find((g) => g.name === name) || null;
}
