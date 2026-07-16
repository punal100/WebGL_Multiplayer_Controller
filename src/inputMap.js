// Maps a controller button to the physical keyboard key each player emits.
// Controller 1 -> WASD cluster + Q/E; Controller 2 -> Arrow keys + ,/.
export const KEY_MAP = {
  1: {
    up: 'w',
    down: 's',
    left: 'a',
    right: 'd',
    a: 'q',
    b: 'e',
    x: 'r',
    y: 'f',
  },
  2: {
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    a: ',',
    b: '.',
    x: '/',
    y: "'",
  },
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

// Dispatches a synthetic keyboard event on the given target window.
export function dispatchSyntheticKey(targetWindow, key, isDown) {
  const { code } = keyToEventProps(key);
  const event = new KeyboardEvent(isDown ? 'keydown' : 'keyup', {
    key,
    code,
    bubbles: true,
    cancelable: true,
  });
  (targetWindow || window).dispatchEvent(event);
}
