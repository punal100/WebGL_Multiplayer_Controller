import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:4567/Game/TankDuel', { waitUntil: 'load' });
await page.waitForTimeout(1500);

// wait for host state
for (let i = 0; i < 20 && !(await page.evaluate(() => !!window.__hostState)); i++) await page.waitForTimeout(250);

// trigger MINE for player 1 ('r')
await page.keyboard.down('r'); await page.waitForTimeout(60); await page.keyboard.up('r');

// sample mine cooldown over ~9s
const samples = [];
for (let t = 0; t < 30; t++) {
  const v = await page.evaluate(() => window.__hostState?.players[0]?.mine ?? window.__hostState?.players[0]?.abilities?.MineCooldown ?? null);
  samples.push(+v.toFixed(2));
  await page.waitForTimeout(300);
}
console.log('MINE samples (should decrease 8->0 smoothly, min seen):', Math.min(...samples), 'max:', Math.max(...samples));
console.log(samples.join(' '));
console.log('errors:', errs);
await browser.close();
