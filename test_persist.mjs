import { chromium } from 'playwright';
const BASE = 'http://localhost:4567';
const browser = await chromium.launch();
const ctx = await browser.newContext();
const host = await ctx.newPage();
const c1 = await ctx.newPage();

await host.goto(BASE + '/');
await c1.goto(`${BASE}/TickTackToe/1`);
await host.waitForFunction(() => !!window.__hostState, null, { timeout: 5000 });
await c1.waitForTimeout(300);

const spawn = await host.evaluate(() => window.__hostState.players[0].x);

// Move P1 forward
await c1.locator('button.up').dispatchEvent('touchstart');
await host.waitForTimeout(900);
await c1.locator('button.up').dispatchEvent('touchend');
await host.waitForTimeout(200);

const before = await host.evaluate(() => window.__hostState.players[0].x);
console.log('spawn x:', spawn, '| after move x:', before, '| moved:', before > spawn + 5);

// Reload host -> state must be preserved
await host.reload();
await host.waitForFunction(() => !!window.__hostState, null, { timeout: 5000 });
const afterReload = await host.evaluate(() => window.__hostState.players[0].x);
console.log('after reload x (== before):', afterReload);
const preserved = Math.abs(afterReload - before) < 5;

// Reset
await host.locator('button.reset-btn').click();
await host.waitForTimeout(500);
const afterReset = await host.evaluate(() => window.__hostState.players[0].x);
console.log('after reset x (back to spawn):', afterReset);
const resetOk = Math.abs(afterReset - spawn) < 5;

console.log('PRESERVED across reload:', preserved, '| RESET works:', resetOk);
await browser.close();
process.exit(preserved && resetOk ? 0 : 1);
