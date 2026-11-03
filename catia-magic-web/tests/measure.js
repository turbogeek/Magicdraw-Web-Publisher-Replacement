// Measures load behaviour of a publication opened from file://
// node measure.js <dir> [label]
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const dir = process.argv[2], label = process.argv[3] || dir;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  // record long tasks and first paints from inside the page
  await page.addInitScript(() => {
    window.__lt = [];
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true }); } catch {}
  });
  const t0 = Date.now();
  const nav = page.goto('file://' + path.resolve(dir, 'index.html'), { waitUntil: 'commit', timeout: 300000 });
  await nav;
  // poll responsiveness: how long does a trivial evaluate take while loading?
  const probes = [];
  let ready = false;
  const poll = (async () => {
    while (!ready && Date.now() - t0 < 180000) {
      const s = Date.now();
      try {
        const st = await page.evaluate(() => ({
          text: (document.querySelector('#cmw-status') || document.querySelector('.cmw-spinner') || {}).textContent || '',
          shell: !!document.querySelector('.cmw-header'),
          home: !!document.querySelector('.cmw-hero')
        }));
        probes.push({ at: s - t0, lag: Date.now() - s, ...st });
        if (st.home) ready = true;
      } catch (e) { probes.push({ at: s - t0, lag: Date.now() - s, err: e.message.slice(0, 60) }); }
      await new Promise((r) => setTimeout(r, 100));
    }
  })();
  await poll;
  const tReady = Date.now() - t0;
  await page.waitForTimeout(1500); // let thumbnails / images settle
  const fcp = await page.evaluate(() => performance.getEntriesByType('paint').map((p) => p.name + '=' + Math.round(p.startTime)).join(' '));
  const lt = await page.evaluate(() => window.__lt);
  const maxLag = Math.max(...probes.map((p) => p.lag));
  const firstText = probes.find((p) => p.text && p.text.trim());
  const longest = lt.reduce((m, x) => Math.max(m, x[1]), 0);
  const blocked = lt.reduce((s, x) => s + x[1], 0);
  console.log(`[${label}] usable=${(tReady / 1000).toFixed(1)}s  ${fcp}  firstLoadingText=${firstText ? (firstText.at / 1000).toFixed(1) + 's' : 'never'}  maxProbeLag=${(maxLag / 1000).toFixed(1)}s  longestTask=${(longest / 1000).toFixed(1)}s  totalBlocked=${(blocked / 1000).toFixed(1)}s  errors=${errs.length}`);
  const mem = await page.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) + 'MB JS heap' : '');
  console.log('   ' + mem + '   status samples: ' + [...new Set(probes.map((p) => (p.text || '').trim()).filter(Boolean))].slice(0, 8).join(' | '));
  await page.screenshot({ path: require('os').tmpdir() + '/measure-' + label.replace(/[^\w.-]/g, '_') + '.png' });
  await browser.close();
})();
