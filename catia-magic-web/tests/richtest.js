// Rich content: CustomImageHolder images, HTML comments/notes, HTML tagged values and properties.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1360, height: 900 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  const base = 'file://' + path.resolve(process.argv[2] || 'out/small', 'index.html');
  const open = async (q) => {
    await p.goto(base + '#/search/' + encodeURIComponent(q));
    await p.waitForSelector('.cmw-results a');
    await p.locator('.cmw-results a').first().click();
    await p.waitForSelector('.cmw-titles h1');
  };
  const imgOk = (sel) => p.locator(sel).first().evaluate((i) => new Promise((r) => (i.complete ? r(i.naturalWidth > 0) : (i.onload = () => r(i.naturalWidth > 0), i.onerror = () => r(false)))));

  await open('Logo PNG');
  check(await imgOk('.cmw-cimg img'), 'CustomImageHolder PNG (base64 with line breaks) renders as an image');
  check(!(await p.locator('.cmw-content').textContent()).includes('iVBORw0KGgo'), 'raw base64 encoding is not shown');
  check((await p.locator('.cmw-cimg figcaption').textContent()).includes('Format: PNG'), 'format/location shown as caption');
  check(!(await p.locator('.cmw-titles').textContent()).includes('CustomImageHolder'), 'internal «CustomImageHolder» stereotype hidden');
  await p.screenshot({ path: path.join(process.argv[3] || 'out/shots', 'r1-custom-image.png') });
  await open('Logo SVG');
  check(await imgOk('.cmw-cimg img'), 'CustomImageHolder SVG text renders as an image');
  await open('Photo MIME');
  check(await imgOk('.cmw-cimg img'), 'CustomImageHolder "MIME: image/jpeg" renders as an image');

  await open('Note: tires');
  const title = await p.locator('.cmw-titles h1').textContent();
  check(!title.includes('<') && !title.includes('__xss') && title.startsWith('Note: tires must be rated'), 'comment label is plain text, not HTML source: "' + title + '"');
  check(await p.locator('.cmw-doc b').count() === 1 && await p.locator('.cmw-doc li').count() === 2, 'comment body rendered as HTML (bold, list)');
  check(await p.evaluate(() => window.__xss === undefined), 'script inside comment HTML did not run');
  check(await p.locator('.cmw-row', { hasText: 'Note: tires' }).count() >= 1, 'tree shows comment by its text');
  await p.screenshot({ path: path.join(process.argv[3] || 'out/shots', 'r2-comment.png') });

  await open('Braking');
  check(await p.locator('#cmw-ep-overview .cmw-kv .cmw-rich b').count() === 1, 'HTML tagged value (requirement Text) rendered as rich text');
  await p.locator('#cmw-et-props').click();
  await p.waitForSelector('#cmw-ep-props .cmw-kv');
  check(await p.locator('#cmw-ep-props .cmw-rich b').count() === 1, 'HTML property value rendered as rich text');
  await p.locator('#cmw-et-overview').click();
  await p.screenshot({ path: path.join(process.argv[3] || 'out/shots', 'r3-html-text.png') });

  // PDF book renders the same way
  await p.goto(base + '#/book/all/-/drp');
  await p.waitForSelector('.cmw-book', { timeout: 60000 });
  check(await p.locator('.cmw-book .cmw-cimg img').count() === 3, 'PDF report includes the three custom images');
  check((await p.locator('.cmw-book').textContent()).indexOf('&lt;') === -1 && !(await p.locator('.cmw-book').textContent()).includes('<html>'), 'PDF report shows no HTML source');
  check(errs.length === 0, 'no page errors ' + errs.join('; '));
  await b.close();
})();
