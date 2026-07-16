import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext();
const host = await ctx.newPage();
const controller = await ctx.newPage();

const hostKeys = [];
await host.exposeFunction('__logKey', (k) => hostKeys.push(k));
await host.goto('http://localhost:4567/');
await host.waitForTimeout(500);
await host.evaluate(() => {
  window.addEventListener('keydown', (e) => window.__logKey(e.key));
});

await controller.goto('http://localhost:4567/TickTackToe/1');
await controller.waitForTimeout(500);

const upBtn = controller.locator('button.up');
await upBtn.dispatchEvent('touchstart');
await controller.waitForTimeout(300);
await upBtn.dispatchEvent('touchend');
await controller.waitForTimeout(300);

const pressed = hostKeys.includes('w');
console.log('Synthetic key "w" received on host:', pressed, '| keys seen:', JSON.stringify(hostKeys));

await browser.close();
process.exit(pressed ? 0 : 1);
