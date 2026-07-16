import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext();
const host = await ctx.newPage();
const c1 = await ctx.newPage();
const c2 = await ctx.newPage();

const hostKeys = [];
await host.exposeFunction('__logKey', (k) => hostKeys.push(k));
await host.goto('http://localhost:4567/');
await host.waitForTimeout(400);
await host.evaluate(() => window.addEventListener('keydown', (e) => window.__logKey(e.key)));

await c1.goto('http://localhost:4567/TickTackToe/1');
await c2.goto('http://localhost:4567/TickTackToe/2');
await host.waitForTimeout(600);

const p1 = host.locator('text=P1 Connected');
const p2 = host.locator('text=P2 Connected');
const p1ok = await p1.count() > 0;
const p2ok = await p2.count() > 0;

// press P2 'up' (ArrowUp) and P1 'a' (left)
await c1.locator('button.left').dispatchEvent('touchstart');
await c2.locator('button.up').dispatchEvent('touchstart');
await host.waitForTimeout(300);
await c1.locator('button.left').dispatchEvent('touchend');
await c2.locator('button.up').dispatchEvent('touchend');
await host.waitForTimeout(300);

const sawA = hostKeys.includes('a');
const sawArrowUp = hostKeys.includes('ArrowUp');
console.log('P1 status connected:', p1ok, '| P2 status connected:', p2ok);
console.log('P1 left -> "a":', sawA, '| P2 up -> "ArrowUp":', sawArrowUp, '| keys:', JSON.stringify(hostKeys));

await browser.close();
process.exit(p1ok && p2ok && sawA && sawArrowUp ? 0 : 1);
