// Failure modes: one data file missing, the data folder missing, inline mode (DataFiles=false).
// node failmodes.js <smallPublicationDir> <templateDir> [legacyPublicationHtml]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const [small, tplDir, legacy] = process.argv.slice(2);
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cmw-fail-'));
const copy = (to) => { fs.cpSync(small, to, { recursive: true }); return to; };
const missing = copy(path.join(tmp, 'missing')); fs.rmSync(path.join(missing, 'data', 'd1.js'));
const nodata = copy(path.join(tmp, 'nodata')); fs.rmSync(path.join(nodata, 'data'), { recursive: true });
const inline = path.join(tmp, 'inline');
execFileSync(process.execPath, [path.join(__dirname, 'render.js'), tplDir, inline], { env: { ...process.env, VARS: '{"DataFiles":"false"}' }, stdio: 'ignore' });
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  const url = (d, h = '') => 'file://' + path.resolve(d, 'index.html') + h;
  await p.goto(url(missing)); await p.waitForSelector('.cmw-banner');
  check((await p.locator('.cmw-banner').textContent()).includes('1 of 2 data files'), 'one missing data file -> app opens with a warning banner');
  await p.goto(url(nodata)); await p.waitForSelector('.cmw-notice-bad');
  check((await p.locator('.cmw-load-title').textContent()).includes('No model data found'), 'data folder missing -> clear error screen');
  await p.goto(url(inline, '#/e/_19_0_6_abc')); await p.waitForSelector('#cmw-et-props');
  await p.locator('#cmw-et-props').click(); await p.waitForSelector('#cmw-ep-props .cmw-kv');
  check((await p.locator('#cmw-ep-props').textContent()).includes('wheels'), 'inline mode (DataFiles=false) incl. properties');
  await p.goto(url(inline, '#/e/_19_0_bdd')); await p.waitForSelector('.cmw-hot');
  check(true, 'inline mode diagram image + hotspots');
  if (legacy) { await p.goto('file://' + path.resolve(legacy)); await p.waitForSelector('.cmw-hero'); check(true, 'opens 3.0.0/3.0.1-format output'); }
  check(errs.length === 0, 'no page errors ' + errs.join(';'));
  await b.close();
  fs.rmSync(tmp, { recursive: true, force: true });
})();
