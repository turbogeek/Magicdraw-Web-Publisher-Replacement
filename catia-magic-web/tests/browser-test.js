// Opens the rendered publication from file:// in Chromium and exercises the viewer.
const { chromium } = require('playwright');
const path = require('path');
const out = process.argv[2];
const shots = process.argv[3];
const url = 'file://' + path.resolve(out, 'index.html');
const IW = 730; // mock image width

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const problems = [];
  const expected = /\/x$|ibd-missing\.png/; // deliberately broken images in the mock data
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/ERR_FILE_NOT_FOUND/.test(m.text())) problems.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => { if (!expected.test(r.url())) problems.push('requestfailed: ' + r.url()); });
  const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) process.exitCode = 1; };
  const h1 = (t) => page.waitForFunction((t) => document.querySelector('.cmw-titles h1')?.textContent === t, t);

  await page.goto(url);
  await page.waitForSelector('.cmw-hero');
  check(await page.locator('.cmw-hero h1').textContent() === 'Vehicle Model Web Publication', 'home renders title');
  check(await page.locator('.cmw-gcard').count() === 0 && await page.locator('.cmw-typecard').count() === 2, 'home shows light diagram-type overview by default (no thumbnails)');
  await page.locator('.cmw-switch').click();
  await page.waitForSelector('.cmw-gcard img');
  check(await page.locator('.cmw-gcard img').first().evaluate((i) => i.naturalWidth > 0), 'preview switch loads thumbnails lazily');
  await page.locator('.cmw-switch').click();
  await page.screenshot({ path: shots + '/1-home.png' });

  await page.locator('.cmw-row', { hasText: 'Requirements' }).first().locator('.cmw-twisty').click();
  await page.locator('.cmw-row', { hasText: 'Max Speed' }).click();
  await page.waitForSelector('.cmw-doc');
  check(await page.evaluate(() => window.__xss === undefined), 'no script executed from documentation');
  check(await page.locator('.cmw-doc a[href="#/e/ENGINE"]').count() === 1, 'mdel:// link rewritten');
  check((await page.locator('#cmw-ep-overview .cmw-kv').first().textContent()).includes('REQ-001'), 'tagged values on overview');
  check((await page.locator('#cmw-ep-rels').textContent()).includes('Engine'), 'relationships tab lists Satisfy from Engine');
  await page.locator('#cmw-et-rels').click();
  check(await page.locator('#cmw-ep-rels').isVisible(), 'relationships tab switches');
  await page.screenshot({ path: shots + '/2-requirement.png' });
  await page.locator('#cmw-et-overview').click();

  // relations folder + single-escaped representation text
  await page.locator('.cmw-row', { hasText: 'Relations' }).first().click();
  check(await page.locator('.cmw-row', { hasText: 'Satisfy[Engine -> Max Speed]' }).count() === 1, 'relationships grouped in Relations folder, text not double-escaped');

  await page.locator('.cmw-doc a[href="#/e/ENGINE"]').click();
  await h1('Engine');
  await page.goBack();
  await h1('Max Speed');
  check(true, 'link navigation + Back');

  // diagram + hotspots
  await page.locator('#cmw-tab-diagrams').click();
  await page.locator('#cmw-tree-diagrams .cmw-row', { hasText: 'Block Definition' }).click();
  await page.locator('#cmw-tree-diagrams .cmw-row', { hasText: 'Vehicle Structure' }).click();
  await page.waitForSelector('.cmw-hot');
  await page.waitForTimeout(300);
  const hot = await page.evaluate((IW) => {
    const img = document.querySelector('.cmw-dimg').getBoundingClientRect();
    const k = img.width / IW;
    return { mode: document.querySelector('.cmw-hotspots').dataset.mode, spots: [...document.querySelectorAll('.cmw-hot')].map((a) => { const r = a.getBoundingClientRect(); return { ref: a.dataset.ref, x: Math.round((r.left - img.left) / k), y: Math.round((r.top - img.top) / k), w: Math.round(r.width / k) }; }) };
  }, IW);
  console.log(JSON.stringify(hot));
  const veh = hot.spots.find((x) => x.ref.endsWith('_6_abc'));
  check(hot.mode === 'anchored' && veh && Math.abs(veh.x - 320) <= 2 && Math.abs(veh.y - 90) <= 2 && Math.abs(veh.w - 160) <= 2, 'hotspots aligned using frame bounds (anchored export)');
  await page.locator('.cmw-dtools button[title^="Outline"]').click();
  await page.screenshot({ path: shots + '/3-diagram.png' });
  await page.locator('.cmw-hot[data-ref="ENGINE"]').click();
  await h1('Engine');
  check(true, 'clicking a shape opens the element');

  // missing image
  await page.evaluate(() => { location.hash = '#/search/Missing'; });
  await page.locator('.cmw-results a').first().click();
  await page.waitForSelector('.cmw-dempty');
  check(true, 'missing diagram image handled');

  // properties tab + favorites
  await page.evaluate(() => { location.hash = '#/search/Vehicle'; });
  await page.locator('.cmw-results a', { hasText: /^Vehicle$/ }).click();
  await page.locator('#cmw-et-props').click();
  await page.waitForFunction(() => document.querySelector('#cmw-ep-props .cmw-kv'));
  check((await page.locator('#cmw-ep-props').textContent()).includes('wheels'), 'properties load on demand (data/p1.js) with element references');
  check((await page.locator('#cmw-et-props').textContent()) === 'Properties (3)', 'properties tab label updates with count');
  check(!(await page.locator('#cmw-ep-props').textContent()).includes('Empty'), 'empty properties are hidden');
  await page.locator('.cmw-fav').click();
  await page.reload();
  await page.waitForSelector('.cmw-header');
  await page.locator('#cmw-tab-favorites').click();
  check((await page.locator('#cmw-tree-favorites').textContent()).includes('Vehicle'), 'favorites persist on file://');
  await page.screenshot({ path: shots + '/4-block.png' });
  await page.locator('#cmw-tab-containment').click();

  // tree paging
  await page.locator('#cmw-tree-containment .cmw-row', { hasText: 'Bulk Package' }).locator('.cmw-twisty').click();
  check(await page.locator('.cmw-more-btn').first().textContent() === 'Show 300 more (350 remaining)', 'big packages render in pages');
  await page.evaluate(() => { location.hash = '#/search/Item 640'; });
  await page.locator('.cmw-results a', { hasText: /^Item 640$/ }).click();
  await h1('Item 640');
  check(await page.locator('#cmw-tree-containment .cmw-selected', { hasText: 'Item 640' }).count() === 1, 'reveal-in-tree renders far enough into a paged folder');
  await page.evaluate(() => { location.hash = '#/about'; });
  await page.waitForSelector('.cmw-grid');
  check((await page.locator('.cmw-grid').textContent()).includes('loaded'), 'about page lists data files and status');
  await page.screenshot({ path: shots + '/4b-about.png' });

  // themes
  for (const t of ['dark', 'kawaii']) {
    await page.locator('.cmw-theme-btn').click();
    await page.locator(`.cmw-theme-menu [data-theme="${t}"]`).click();
    check(await page.evaluate(() => document.documentElement.dataset.theme) === t, 'theme switches to ' + t);
    await page.evaluate(() => { location.hash = '#/'; });
    await page.waitForSelector('.cmw-hero');
    await page.screenshot({ path: shots + `/5-${t}-home.png` });
    await page.evaluate(() => { location.hash = '#/e/_19_0_bdd'; });
    await page.waitForSelector('.cmw-dimg');
    await page.waitForTimeout(300);
    await page.screenshot({ path: shots + `/6-${t}-diagram.png` });
  }

  // PDF dialog
  await page.locator('.cmw-hdr-actions button[title="Export PDF"]').click();
  check(await page.locator('dialog.cmw-dialog[open]').isVisible(), 'PDF dialog opens');
  await page.screenshot({ path: shots + '/7-pdf-dialog.png' });
  await page.keyboard.press('Escape');

  // book view -> real PDF
  await page.evaluate(() => { location.hash = '#/book/all/-/dr'; });
  await page.waitForSelector('.cmw-book');
  check((await page.locator('.cmw-sec').count()) > 10, 'book has sections');
  check((await page.locator('.cmw-fig img').count()) >= 1, 'book contains diagram figures');
  await page.screenshot({ path: shots + '/8-book.png' });
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: shots + '/model-report.pdf', format: 'A4', printBackground: true, displayHeaderFooter: false, preferCSSPageSize: true });
  await page.emulateMedia({ media: 'screen' });
  // print a single element page too
  await page.evaluate(() => { location.hash = '#/search/Vehicle Structure'; });
  await page.locator('.cmw-results a').first().click();
  await page.waitForSelector('.cmw-dimg');
  await page.waitForTimeout(300);
  await page.pdf({ path: shots + '/single-page.pdf', format: 'A4', printBackground: true, preferCSSPageSize: true });

  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: shots + '/9-mobile.png' });

  check(problems.length === 0, 'no console errors / CSP violations / unexpected failed requests' + (problems.length ? ':\n  ' + problems.join('\n  ') : ''));
  await browser.close();
})();
