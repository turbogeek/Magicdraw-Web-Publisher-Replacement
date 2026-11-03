// Generates the README screenshots from the test model. node docshots.js <publicationDir> <outDir>
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [pub, out] = process.argv.slice(2);
  const base = 'file://' + path.resolve(pub, 'index.html');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1 });
  const shot = (n) => p.screenshot({ path: path.join(out, n) });
  const go = async (hash, sel) => { await p.goto(base + hash); await p.waitForSelector(sel || '.cmw-header'); await p.waitForTimeout(400); };
  await go('', '.cmw-hero');
  await p.locator('.cmw-row', { hasText: 'Structure' }).first().locator('.cmw-twisty').click();
  await shot('home.png');
  await go('#/e/_19_0_bdd', '.cmw-hot');
  await p.locator('.cmw-dtools button[title^="Outline"]').click();
  await p.locator('.cmw-hot[data-ref="ENGINE"]').hover();
  await shot('diagram.png');
  await p.locator('.cmw-hot[data-ref="ENGINE"]').click({ button: 'right' });
  await p.waitForTimeout(200);
  await shot('diagram-context-menu.png');
  await p.keyboard.press('Escape');
  await p.locator('.cmw-dtools button[title^="Outline"]').click();
  await go('#/search/Max%20Speed', '.cmw-results a'); await p.locator('.cmw-results a').first().click(); await p.waitForSelector('.cmw-doc');
  await shot('element.png');
  await p.locator('#cmw-et-rels').click(); await shot('element-relationships.png'); await p.locator('#cmw-et-overview').click();
  await go('#/search/Braking', '.cmw-results a'); await p.locator('.cmw-results a').first().click(); await p.waitForSelector('.cmw-rich'); await shot('rich-text.png');
  await go('#/search/Logo%20PNG', '.cmw-results a'); await p.locator('.cmw-results a').first().click(); await p.waitForSelector('.cmw-cimg img'); await shot('custom-image.png');
  await go('#/', '.cmw-hero');
  await p.locator('#cmw-search').fill('req'); await p.waitForSelector('#cmw-suggest:not([hidden]) li'); await shot('search-suggest.png');
  await go('#/search/%2F%5EReq%201%5B0-4%5D%24%2F', '.cmw-results a'); await shot('search-regex.png');
  await go('#/about', '.cmw-grid'); await shot('about.png');
  await go('#/', '.cmw-hero'); await p.locator('.cmw-hdr-actions button[title="Export PDF"]').click(); await p.waitForSelector('dialog[open]'); await shot('pdf-dialog.png'); await p.keyboard.press('Escape');
  await go('#/book/all/-/dr', '.cmw-book'); await shot('pdf-preview.png');
  await p.emulateMedia({ media: 'print' }); await p.pdf({ path: path.join(out, 'sample-report.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true }); await p.emulateMedia({ media: 'screen' });
  for (const t of ['dark', 'kawaii']) {
    await go('', '.cmw-hero');
    await p.locator('.cmw-theme-btn').click(); await p.locator(`.cmw-theme-menu [data-theme="${t}"]`).click();
    await go('#/', '.cmw-hero'); await shot('theme-' + t + '.png');
    await go('#/e/_19_0_bdd', '.cmw-hot'); await shot('theme-' + t + '-diagram.png');
  }
  await p.locator('.cmw-theme-btn').click(); await p.locator('.cmw-theme-menu [data-theme="system"]').click();
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 20 });
  await p.goto(base, { waitUntil: 'commit' }); await p.waitForTimeout(60);
  await p.locator('.cmw-load-card').screenshot({ path: path.join(out, 'loading.png') }).catch(() => {});
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await p.setViewportSize({ width: 390, height: 760 }); await go('#/e/_19_0_bdd', '.cmw-hot'); await shot('mobile.png');
  await b.close();
})();
