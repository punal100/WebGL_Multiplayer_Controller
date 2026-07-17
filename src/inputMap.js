// Maps a controller button to the physical keyboard key each player emits.
// Controller 1 -> WASD cluster + Q(fire) E(dash) R(mine) F(special)
// Controller 2 -> Arrow keys + ,(fire) .(dash) /(mine) '(special)
//
// Button layout (Nintendo-style):
//   A = Fire        (primary)
//   B = Dash/Evade  (quick burst)
//   X = Mine/Barricade
//   Y = Special (ricochet round)
export const KEY_MAP = {
  1: {
    up: 'w',
    down: 's',
    left: 'a',
    right: 'd',
    a: 'q', // fire
    b: 'e', // dash
    x: 'r', // mine
    y: 'f', // special
  },
  2: {
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    a: ',', // fire
    b: '.', // dash
    x: '/', // mine
    y: "'", // special
  },
};

// Human-readable labels + capability hints for the on-screen controller.
export const BUTTON_META = {
  a: { label: 'A', hint: 'Fire' },
  b: { label: 'B', hint: 'Dash' },
  x: { label: 'X', hint: 'Mine' },
  y: { label: 'Y', hint: 'Ricochet' },
};

// Maps a logical key to {key, code} for KeyboardEvent construction.
export function keyToEventProps(key) {
  // Special keys
  const special = {
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    ',': 'Comma',
    '.': 'Period',
    '/': 'Slash',
    "'": 'Quote',
    ' ': 'Space',
  };
  if (special[key]) {
    return { key, code: special[key] };
  }
  const code = `Key${key.toUpperCase()}`;
  return { key, code };
}
