// 3.0.4 skeleton-first loading: startup loads elements only; documentation and diagram details load on demand
// or in the background. node lazytest.js <publicationDir>
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const pub = path.resolve(process.argv[2] || 'out/small');
  const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  const loaded = [];
  p.on('request', (r) => { const m = r.url().match(/data\/([a-z]\d+)\.js$/); if (m) loaded.push(m[1]); });
  await p.goto('file://' + pub + '/index.html');
  await p.waitForSelector('.cmw-hero');
  const atStartup = [...new Set(loaded)];
  check(atStartup.join() === 'e1', 'only element files are loaded before the page appears: ' + atStartup.join(', '));
  check(!loaded.includes('p1'), 'properties stay on demand');
  check(await p.locator('.cmw-typecard').count() === 2, 'Diagrams overview works from skeletons before diagram details load');
  check(await p.locator('#cmw-indexing').isVisible(), 'sidebar shows "Indexing documentation and diagrams" while background loads');
  await p.locator('#cmw-tab-diagrams').click();
  check((await p.locator('#cmw-tree-diagrams').textContent()).includes('Block Definition Diagram'), 'Diagrams tab grouped by type from skeletons');
  await p.waitForFunction(() => document.getElementById('cmw-indexing')?.hidden === true, null, { timeout: 30000 });
  check(true, 'indicator disappears when indexing completes');
  await p.goto('file://' + pub + '/index.html#/e/ENGINE'); await p.waitForSelector('.cmw-titles h1');
  check((await p.locator('.cmw-rail').textContent()).includes('Vehicle Structure'), '"Appears in" complete after indexing');
  // fresh load, open a diagram directly: its details load on demand even while the background queue is held
  const p2 = await ctx.newPage();
  await p2.goto('file://' + pub + '/index.html#/e/_19_0_bdd');
  await p2.waitForSelector('.cmw-hot', { timeout: 30000 });
  check(true, 'opening a diagram loads its details on demand (hotspots present)');
  await p2.goto('file://' + pub + '/index.html#/search/Max%20Speed');
  await p2.locator('#cmw-sdocs').check().catch(() => {});
  const st = await p2.locator('.cmw-content [role=status]').first().textContent();
  check(/still indexing documentation/.test(st) || /result/.test(st), 'documentation search reports indexing state: "' + st.trim() + '"');
  check(errs.length === 0, 'no page errors ' + errs.join('; '));
  await b.close();
})();
