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

// Move P1 via controller 1 for ~1.2s
await c1.locator('button.up').dispatchEvent('touchstart');
await host.waitForTimeout(1200);
await c1.locator('button.up').dispatchEvent('touchend');
await host.waitForTimeout(300);

// Grab actual rendered canvas pixels from host + both controllers
const grab = async (page) =>
  page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c.toDataURL().slice(0, 5000); // prefix is enough to compare
  });

const h = await grab(host);
const a = await grab(c1);
const b = await grab(c2);

console.log('Host == C1 pixels:', h === a);
console.log('Host == C2 pixels:', h === b);
console.log('C1 == C2 pixels:', a === b);

await browser.close();
process.exit(h === a && h === b ? 0 : 1);
