import { chromium } from 'playwright';

const BASE = 'http://localhost:4567';
const browser = await chromium.launch();
const ctx = await browser.newContext();

const host = await ctx.newPage();
const c1 = await ctx.newPage();
const c2 = await ctx.newPage();

await host.goto(BASE + '/');
await c1.goto(`${BASE}/TickTackToe/1`);
await c2.goto(`${BASE}/TickTackToe/2`);
await host.waitForTimeout(600);

// Move both players via controllers
await c1.locator('button.up').dispatchEvent('touchstart');
await c2.locator('button.right').dispatchEvent('touchstart');
await host.waitForTimeout(1200);
await c1.locator('button.up').dispatchEvent('touchend');
await c2.locator('button.right').dispatchEvent('touchend');
await host.waitForTimeout(400);

// Read host state by exposing it the same way on the host page
await host.evaluate(() => {
  // host doesn't set __clientState; grab from a late-join controller instead
});
const getClient = (page) => page.evaluate(() => window.__clientState);

// The most reliable: compare C1 and C2 (both clients of same host)
const s1 = await getClient(c1);
const s2 = await getClient(c2);

const p = (s) => s.players.map((pl) => ({ x: pl.x, y: pl.y, angle: pl.angle, alive: pl.alive }));
console.log('C1:', JSON.stringify(p(s1)));
console.log('C2:', JSON.stringify(p(s2)));
console.log('Clients synced:', JSON.stringify(p(s1)) === JSON.stringify(p(s2)));

await browser.close();
process.exit(JSON.stringify(p(s1)) === JSON.stringify(p(s2)) ? 0 : 1);
