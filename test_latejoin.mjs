import { chromium } from 'playwright';

const BASE = 'http://localhost:4567';
const browser = await chromium.launch();
const ctx = await browser.newContext();

const host = await ctx.newPage();
const c1 = await ctx.newPage();

await host.goto(BASE + '/');
await c1.goto(`${BASE}/TickTackToe/1`);
await host.waitForTimeout(500);

// Move P1 using the host's own keyboard for ~1s (simulate real movement)
await host.evaluate(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
});
await host.waitForTimeout(1000);
await host.evaluate(() => {
  window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' }));
});

// NOW (after movement) connect controller 2 late
const c2 = await ctx.newPage();
await c2.goto(`${BASE}/TickTackToe/2`);
await host.waitForTimeout(600);

const getState = (page) => page.evaluate(() => window.__clientState || null);

const s1 = await getState(c1);
const s2 = await getState(c2);

console.log('C1 P1:', s1 && s1.players[0]);
console.log('C2 P1 (late join):', s2 && s2.players[0]);
console.log('Identical?', JSON.stringify(s1 && s1.players[0]) === JSON.stringify(s2 && s2.players[0]));

await browser.close();
process.exit(0);
