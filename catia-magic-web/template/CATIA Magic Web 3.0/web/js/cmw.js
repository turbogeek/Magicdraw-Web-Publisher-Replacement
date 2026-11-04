/*!
 * CATIA Magic Web 3.0 viewer (3.0.1)
 *
 * Runs from file:// or any static web server:
 *  - no XMLHttpRequest / fetch: the model is read from the inert <template id="cmw-data"> in the page
 *  - no eval / new Function / inline handlers: works under a strict Content-Security-Policy
 *  - model text is inserted with textContent; HTML documentation is sanitized with DOMPurify
 *  - classic script (not an ES module) because browsers block module scripts on file://
 */
(() => {
  'use strict';

  // ------------------------------------------------------------------ utilities
  const $ = (sel, root = document) => root.querySelector(sel);
  const bool = (v, d) => (v === 'true' ? true : v === 'false' ? false : d);
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const VERSION = '3.0.4';

  /** Tiny DOM builder: h('div', {class:'x', onclick: fn}, child, 'text', [more]) */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'class') el.className = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'text') el.textContent = v;
        else if (k === 'style') el.style.cssText = v; // CSSOM: allowed under CSP
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    append(el, kids);
    return el;
  }
  function append(el, kids) {
    for (const k of kids) {
      if (k == null || k === false) continue;
      if (Array.isArray(k)) append(el, k);
      else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
    }
  }
  const storage = {
    get(key, dflt) { try { const v = localStorage.getItem(key); return v == null ? dflt : JSON.parse(v); } catch { return dflt; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* unavailable */ } }
  };
  /** Cameo sometimes hands over text that is already entity-escaped (representation text). */
  const ENT = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&amp;': '&' };
  const decodeEntities = (s) => (s && /&(lt|gt|quot|#39|apos|amp);/.test(s) ? s.replace(/&(lt|gt|quot|#39|apos|amp);/g, (m) => ENT[m]) : s);

  // ------------------------------------------------------------------ icons
  const ICONS = {
    package: 'M2 5h5l1.5 1.5H14v7.5H2z',
    model: 'M8 1.5 14 5v6l-6 3.5L2 11V5zM8 1.5V8m0 0 6-3M8 8 2 5',
    diagram: 'M2 2h12v12H2zM4.5 4.5h3v2.5h-3zm4 4h3V11h-3zM6 7v2.7h2.5',
    table: 'M2 3h12v10H2zM2 6.5h12M2 10h12M6 3v10',
    requirement: 'M3 2h7l3 3v9H3zM5.5 7h5M5.5 9.5h5M5.5 12h3',
    block: 'M2 3h12v10H2zM2 6h12',
    property: 'M4 4h8v8H4z',
    port: 'M5 5h6v6H5zM1.5 8H5m6 0h3.5',
    behavior: 'M3 3h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
    state: 'M4 3h8a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM1 7h14',
    actor: 'M8 4.5a1.8 1.8 0 1 0 0-.1zM8 6.5v4m-3.5-2.5h7M8 10.5l-3 3.5m3-3.5 3 3.5',
    usecase: 'M8 4c4 0 7 1.8 7 4s-3 4-7 4-7-1.8-7-4 3-4 7-4z',
    constraint: 'M6 2.5c-2 0-2 1-2 2.5S3 7.5 2 8c1 .5 2 1 2 3s0 2.5 2 2.5m4-11c2 0 2 1 2 2.5s1 2.5 2 3c-1 .5-2 1-2 3s0 2.5-2 2.5',
    relation: 'M2 13 13 2m0 0H7.5M13 2v5.5',
    relfolder: 'M2 4h4.5L8 5.5h6v8H2zM6 11.5l4-4m0 0H7.5m2.5 0V10',
    import: 'M8 2v8m0 0-3-3m3 3 3-3M3 13h10',
    comment: 'M2 2.5h12v8.5H7l-3.5 3v-3H2z',
    file: 'M4 1.5h5.5L13 5v9.5H4zM9.5 1.5V5H13',
    folder: 'M2 4h4.5L8 5.5h6v8H2z',
    valuetype: 'M3 3h10v10H3zM5.5 6.5h5M8 6.5v4',
    unit: 'M3 12V4l5 6 5-6v8',
    element: 'M8 3.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z'
  };
  const TABLE_TYPES = /table|matrix|\bmap\b|relation map|dependency/i;
  const INTERNAL_STEREO = /^(DiagramInfo|DiagramTable|DiagramMatrix|DiagramLegend|DiagramFrame|InvisibleStereotype|CustomImageHolder)$/;
  const visibleStereos = (rec) => rec.stereos.filter((s) => !INTERNAL_STEREO.test(s.name));
  function iconKey(rec) {
    if (!rec) return 'element';
    if (rec.virtual) return rec.relFolder ? 'relfolder' : 'folder';
    if (rec.isDiagram) return TABLE_TYPES.test(rec.dtype || '') ? 'table' : 'diagram';
    const t = (rec.type || '').toLowerCase();
    if (rec.rel) return /import/.test(t) ? 'import' : 'relation';
    const st = rec.stereos.map((s) => s.name.toLowerCase()).join(' ');
    const both = t + ' ' + st;
    if (/requirement/.test(both)) return 'requirement';
    if (/\bmodel\b|profile/.test(t)) return 'model';
    if (/package|library|view\b/.test(t)) return 'package';
    if (/constraint/.test(both)) return 'constraint';
    if (/\bport\b|interface block|flow specification|proxy port|full port/.test(both)) return 'port';
    if (/actor/.test(t)) return 'actor';
    if (/use case/.test(t)) return 'usecase';
    if (/state|region|pseudostate/.test(t)) return 'state';
    if (/activity|action|behavior|interaction|operation|node|flow|transition|pin|parameter/.test(t)) return 'behavior';
    if (/\bunit\b|quantity ?kind/.test(both)) return 'unit';
    if (/value ?type/.test(both)) return 'valuetype';
    if (/property|part|reference|value|slot|attribute|literal/.test(t)) return 'property';
    if (/block|class|component|interface|signal|enumeration|data ?type|instance|system|subsystem/.test(both)) return 'block';
    if (/comment|note/.test(t)) return 'comment';
    if (rec.file) return 'file';
    return 'element';
  }
  function svgIcon(d, cls) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', cls);
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
    return svg;
  }
  function icon(rec, extra) {
    const key = typeof rec === 'string' ? rec : iconKey(rec);
    return svgIcon(ICONS[key] || ICONS.element, 'cmw-icon cmw-icon-' + key + (extra ? ' ' + extra : ''));
  }
  const UI = {
    back: 'M10 3 5 8l5 5', fwd: 'm6 3 5 5-5 5', search: 'M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm3.2 7.7L14 14',
    star: 'M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.2L8 11.5l-3.8 2 .7-4.2-3.1-3 4.3-.6z', home: 'M2 8 8 2.5 14 8M4 6.5V14h8V6.5',
    collapse: 'M3 4h10M5.5 8h7.5M5.5 12h7.5M3 8h.5M3 12h.5', locate: 'M8 1v3m0 8v3M1 8h3m8 0h3M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    zoomIn: 'M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm3.2 7.7L14 14M5 7h4M7 5v4', zoomOut: 'M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm3.2 7.7L14 14M5 7h4',
    fit: 'M2 6V2h4m4 0h4v4m0 4v4h-4m-4 0H2v-4', actual: 'M3 3h10v10H3zM6 6v4m4-4v4',
    menu: 'M2 4h12M2 8h12M2 12h12', external: 'M9 2h5v5m0-5L7 9m-1-5H2v10h10v-4', hot: 'M2 2h5v5H2zm7 7h5v5H9zM7 4.5h4.5V9',
    print: 'M4 6V2h8v4M4 12H2V6h12v6h-2M4 10h8v4H4z', link: 'M6.5 9.5l3-3M7 4l1.2-1.2a2.6 2.6 0 0 1 3.7 3.7L10.7 7.7M9 12l-1.2 1.2a2.6 2.6 0 0 1-3.7-3.7l1.2-1.2',
    pdf: 'M4 1.5h5.5L13 5v9.5H4zM9.5 1.5V5H13M6 9h4M6 11.5h4M6 6.5h1.5',
    sun: 'M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM8 1v1.5m0 11V15M1 8h1.5m11 0H15M3 3l1 1m8 8 1 1M3 13l1-1m8-8 1-1',
    moon: 'M13.5 10A6 6 0 0 1 6 2.5a6 6 0 1 0 7.5 7.5z', system: 'M2 3h12v8H2zM6 14h4M8 11v3',
    heart: 'M8 13.5S2 10 2 6a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 4-6 7.5-6 7.5z', copy: 'M5 5h8v9H5zM3 11V2h8',
    close: 'M3.5 3.5l9 9m0-9-9 9', chevron: 'm4 6 4 4 4-4'
  };
  const uiIcon = (name) => svgIcon(UI[name] || '', 'cmw-ui-icon');

  // ------------------------------------------------------------------ config
  const ds = document.body.dataset;
  /** "basic units.mdzip [E:\samples\]" -> "basic units" */
  const cleanProject = (s) => (s || '').replace(/\s*\[[^\]]*\]\s*$/, '').replace(/\.(mdzip|mdxml|xml|uml)$/i, '').trim();
  const projectName = cleanProject(ds.project);
  const cfg = {
    title: (ds.title || '').trim() || projectName || 'Model publication',
    author: ds.author || '',
    project: projectName,
    projectFile: ds.project || '',
    generated: ds.generated || '',
    logo: ds.logo || '',
    homeImage: ds.homeImage || '',
    homeDiagram: ds.homeDiagram || '',
    contextMenu: bool(ds.contextMenu, true),
    appearsIn: bool(ds.appearsIn, true),
    treeIds: bool(ds.treeIds, false),
    treeStereotypes: bool(ds.treeStereotypes, false),
    fitDiagrams: bool(ds.fitDiagrams, true),
    hotspots: bool(ds.hotspots, true),
    props: bool(ds.props, true),
    previews: bool(ds.previews, false)
  };
  const storeKey = 'cmw3:' + (cfg.projectFile || cfg.title) + ':';

  // ------------------------------------------------------------------ data loading (progressive)
  /** id -> record */
  const model = new Map();
  const roots = [];
  const diagrams = [];
  /** data files from the manifest: { k: 'e'|'d'|'p', n, src, res, c, state, ms } */
  const files = [];
  const images = new Map(); // diagram id -> { src, w, h }
  const loadLog = []; // [label, ms]
  const chunkTexts = new Map();
  let inlineMode = false;
  // Data files call this when their <script> runs: CMW_CHUNK('e', 3, String.raw`...markup...`)
  window.CMW_CHUNK = (k, n, text) => { chunkTexts.set(k + n, text); };

  /** Give the browser a chance to paint and handle input during long work (~every 40 ms). */
  let lastYield = performance.now();
  async function maybeYield(force) {
    if (force || performance.now() - lastYield > 40) {
      await new Promise((r) => setTimeout(r, 0));
      lastYield = performance.now();
    }
  }
  /** Loading screen (exists in index.html before the app shell is built). */
  function loadStatus(text, fraction) {
    const st = document.getElementById('cmw-status');
    if (st) st.textContent = text;
    const bar = document.getElementById('cmw-bar');
    if (bar && fraction != null) { bar.classList.add('cmw-determinate'); bar.style.width = Math.round(Math.max(0.03, Math.min(1, fraction)) * 100) + '%'; }
  }

  // Children of a node grouped by tag, computed once per node (a filter per lookup was ~25 % of load time)
  const kidCache = new WeakMap();
  const kids = (node, tag) => {
    let m = kidCache.get(node);
    if (!m) {
      m = new Map();
      for (let c = node.firstElementChild; c; c = c.nextElementSibling) { const l = m.get(c.localName); l ? l.push(c) : m.set(c.localName, [c]); }
      kidCache.set(node, m);
    }
    return m.get(tag) || [];
  };
  const boxes = (node, tag) => kids(node, tag).map((b) => ({ x: +b.dataset.x, y: +b.dataset.y, w: +b.dataset.w, h: +b.dataset.h }))
    .filter((b) => Number.isFinite(b.x) && Number.isFinite(b.y) && b.w > 0 && b.h > 0);
  const readProps = (node) => kids(node, 'x-p').map((p) => ({
    name: p.dataset.n || '',
    values: Array.from(p.children).map((v) => (v.localName === 'x-r' ? { ref: v.dataset.ref, text: toPlain(decodeEntities(v.textContent), 120) } : { text: v.textContent })).filter((v) => v.ref || v.text !== '')
  })).filter((p) => p.values.length);
  function readBody(node, rec) {
    const doc = kids(node, 'x-doc')[0];
    if (doc) { rec.doc = doc.textContent; rec.docLoaded = true; }
    for (const s of kids(node, 'x-s')) rec.stereos.push({ name: s.dataset.n || '', tags: kids(s, 'x-v').map((v) => ({ name: v.dataset.n || '', value: v.textContent })) });
    const inlineProps = readProps(node); // 3.0.0/3.0.1 wrote properties inside the element
    if (inlineProps.length) { rec.props = inlineProps; rec.propsLoaded = true; }
  }
  const blank = (node, chunk) => ({
    id: node.dataset.id, name: toPlain(decodeEntities(node.dataset.n || ''), 120), type: node.dataset.t || '', owner: node.dataset.o || '',
    rel: node.dataset.rel === '1', isDiagram: false, doc: '', docLoaded: false, stereos: [], props: [], propsLoaded: false, pchunk: chunk || 0,
    children: [], relations: [], appearsIn: [], ends: null, file: ''
  });
  function addElement(node, chunk) {
    if (!node.dataset.id) return;
    const prev = model.get(node.dataset.id);
    if (prev && prev.isDiagram) { prev.pchunk = prev.pchunk || chunk; return; } // diagram skeleton already known
    const rec = blank(node, chunk);
    readBody(node, rec);
    if (rec.rel) {
      const ref = (n) => ({ ref: n.dataset.ref, text: toPlain(decodeEntities(n.textContent), 120) });
      rec.ends = { src: kids(node, 'x-src').map(ref), tgt: kids(node, 'x-tgt').map(ref), any: kids(node, 'x-end').map(ref) };
    }
    const f = kids(node, 'x-file')[0];
    if (f) rec.file = f.dataset.href || '';
    const body = kids(node, 'x-body')[0]; // Comment / note text (often HTML)
    if (body) {
      rec.body = body.textContent;
      const plain = toPlain(rec.body, 80);
      if (plain && (!rec.name || /^comment\b/i.test(rec.name) || rec.name === rec.type)) rec.name = plain;
    }
    model.set(rec.id, rec);
  }
  /** 3.0.4: <x-di> in the page = diagram skeleton (name/type/owner/detail file/image). Older output: image only. */
  function addDiagramSkeleton(node) {
    const id = node.dataset.id;
    const img = node.querySelector('img');
    let src = img ? img.getAttribute('src') || '' : '';
    if (/^Image \[/.test(src)) src = '';
    if (src) images.set(id, { src, w: parseFloat(node.dataset.iw) || 0, h: parseFloat(node.dataset.ih) || 0 });
    if (node.dataset.t == null) return; // pre-3.0.4: image reference only
    const rec = blank(node, 0);
    Object.assign(rec, { isDiagram: true, dtype: rec.type, img: src, imgW: parseFloat(node.dataset.iw) || 0, imgH: parseFloat(node.dataset.ih) || 0,
      dchunk: +node.dataset.dc || 0, detailLoaded: false, frame: [], shapes: [] });
    model.set(id, rec);
    diagrams.push(rec);
    skeletons = true;
  }
  /** Diagram details (documentation, stereotypes, shapes, bounds); merges into the skeleton when there is one. */
  function addDiagram(node) {
    if (!node.dataset.id) return;
    const prev = model.get(node.dataset.id);
    const rec = prev && prev.isDiagram ? prev : blank(node, prev ? prev.pchunk : 0);
    if (rec !== prev) {
      if (prev) { rec.doc = prev.doc; rec.docLoaded = prev.docLoaded; rec.props = prev.props; rec.propsLoaded = prev.propsLoaded; }
      rec.isDiagram = true;
      rec.dtype = rec.type;
      // 3.0.1 wrote <x-img><img></x-img> inside the diagram; 3.0.0 wrote data-img (ignore Cameo's "Image [id=...]" text)
      const imgEl = node.querySelector(':scope > x-img img');
      let src = imgEl ? imgEl.getAttribute('src') || '' : node.dataset.img || '';
      if (/^Image \[/.test(src)) src = '';
      rec.img = src;
      rec.imgW = parseFloat(node.dataset.iw) || 0;
      rec.imgH = parseFloat(node.dataset.ih) || 0;
      model.set(rec.id, rec);
      diagrams.push(rec);
    }
    rec.stereos = [];
    readBody(node, rec);
    rec.docLoaded = true;
    rec.frame = boxes(node, 'x-pb');
    const u = kids(node, 'x-u')[0]; // union of all drawn content, computed in the template
    if (u) {
      const x0 = +u.dataset.x0, y0 = +u.dataset.y0, x1 = +u.dataset.x1, y1 = +u.dataset.y1;
      if ([x0, y0, x1, y1].every(Number.isFinite) && x1 > x0 && y1 > y0) rec.frame = [{ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }];
    }
    rec.shapes = kids(node, 'x-h').map((hn) => ({ ref: hn.dataset.ref, rel: hn.dataset.rel === '1', boxes: boxes(hn, 'x-b') }));
    // "Appears in" index, built as diagram details arrive
    const seen = new Set();
    for (const s of rec.shapes) {
      if (seen.has(s.ref)) continue;
      seen.add(s.ref);
      const t = model.get(s.ref);
      if (t && !t.appearsIn.includes(rec.id)) t.appearsIn.push(rec.id);
    }
    rec.detailLoaded = true;
  }
  function addProps(node) {
    const rec = model.get(node.dataset.id);
    if (rec) { rec.props = readProps(node); rec.propsLoaded = true; }
  }
  function addDocs(node) {
    const rec = model.get(node.dataset.id);
    const doc = kids(node, 'x-doc')[0];
    if (rec && doc) { rec.doc = doc.textContent; rec.docLoaded = true; }
  }
  async function ingestFragment(frag, chunk) {
    let i = 0;
    for (const node of Array.from(frag.children)) {
      switch (node.localName) {
        case 'x-e': addElement(node, chunk); break;
        case 'x-d': addDiagram(node); break;
        case 'x-o': addDocs(node); break;
        case 'x-pp': addProps(node); break;
        case 'x-di': addDiagramSkeleton(node); break;
        default: break;
      }
      if ((++i & 255) === 0) await maybeYield();
    }
  }
  /** Load one data file as a <script> (allowed from file://) and return its markup text. */
  function loadChunk(f) {
    if (f.promise) return f.promise;
    f.state = 'loading';
    const t0 = performance.now();
    f.promise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      const timer = setTimeout(() => fail(new Error('timed out')), 120000);
      const done = () => { clearTimeout(timer); s.remove(); };
      const fail = (err) => { done(); f.state = 'failed'; f.error = err.message; reject(err); };
      s.onload = () => {
        done();
        const text = chunkTexts.get(f.k + f.n);
        chunkTexts.delete(f.k + f.n);
        if (text == null) return fail(new Error('file loaded but contained no model data'));
        f.state = 'loaded';
        f.ms = Math.round(performance.now() - t0);
        resolve(text);
      };
      s.onerror = () => fail(new Error('file not found or blocked'));
      s.src = f.src;
      document.head.append(s);
    });
    return f.promise;
  }
  /** Load + parse a data file once; concurrent callers share the same promise. */
  function ingestChunk(f) {
    if (!f.ingest) f.ingest = (async () => {
      const text = await loadChunk(f);
      const tpl = document.createElement('template');
      tpl.innerHTML = text; // inert: <template> content never runs scripts or loads images
      await maybeYield();
      await ingestFragment(tpl.content, f.k === 'e' ? f.n : 0);
      if (f.k === 'o') for (const r of model.values()) if (r.pchunk === f.n && !r.isDiagram) r.docLoaded = true;
      if (f.k === 'p') for (const r of model.values()) if (r.pchunk === f.n) r.propsLoaded = true;
    })();
    return f.ingest;
  }
  const fileFor = (k, n) => files.find((x) => x.k === k && x.n === n);
  /** Specification properties are loaded on demand, one data file at a time. */
  function ensureProps(rec) {
    if (!rec || rec.propsLoaded || !rec.pchunk) return Promise.resolve();
    const f = fileFor('p', rec.pchunk);
    if (!f) { rec.propsLoaded = true; return Promise.resolve(); }
    return ingestChunk(f);
  }
  /** Documentation (elements: o*.js; diagrams: their d*.js file). */
  function ensureDocs(rec) {
    if (!rec || rec.docLoaded) return Promise.resolve();
    if (rec.isDiagram) return ensureDiagram(rec);
    const f = rec.pchunk && fileFor('o', rec.pchunk);
    if (!f) { rec.docLoaded = true; return Promise.resolve(); }
    return ingestChunk(f).catch(() => { rec.docLoaded = true; });
  }
  function ensureDiagram(rec) {
    if (!rec || !rec.isDiagram || rec.detailLoaded) return Promise.resolve();
    const f = rec.dchunk && fileFor('d', rec.dchunk);
    if (!f) { rec.detailLoaded = true; rec.docLoaded = true; return Promise.resolve(); }
    return ingestChunk(f).catch(() => { rec.detailLoaded = true; rec.docLoaded = true; });
  }

  // ---- background indexing: documentation and diagram details after the page is usable
  const bg = { total: 0, done: 0, ready: true, waiters: [] };
  let skeletons = false;
  const indexed = () => bg.ready;
  /** Resolve when documentation and diagram details are fully loaded. */
  const whenIndexed = () => (bg.ready ? Promise.resolve() : new Promise((r) => bg.waiters.push(r)));
  function bgStatus() {
    const el = document.getElementById('cmw-indexing');
    if (!el) return;
    if (bg.ready) { el.hidden = true; return; }
    el.hidden = false;
    el.lastChild.textContent = 'Indexing documentation and diagrams… ' + Math.round((100 * bg.done) / (bg.total || 1)) + '%';
  }
  const backgroundQueue = () => files.filter((f) => f.k === 'o').concat(skeletons ? files.filter((f) => f.k === 'd') : []);
  async function backgroundLoad() {
    const queue = backgroundQueue();
    if (!queue.length) { bg.ready = true; bgStatus(); bg.waiters.splice(0).forEach((fn) => fn()); return; }
    bg.total = queue.length; bg.done = 0; bg.ready = false;
    bgStatus();
    const t = performance.now();
    for (const f of queue) {
      try { await ingestChunk(f); } catch (err) { console.warn('[CMW] ' + f.src + ': ' + err.message); }
      bg.done++;
      bgStatus();
      await new Promise((r) => setTimeout(r, 0)); // stay out of the way of clicks and scrolling
    }
    for (const r of model.values()) { if (!r.virtual) { if (!r.isDiagram) r.docLoaded = true; else { r.detailLoaded = true; r.docLoaded = true; } } }
    bg.ready = true;
    loadLog.push(['background index', Math.round(performance.now() - t)]);
    bgStatus();
    bg.waiters.splice(0).forEach((fn) => fn());
  }

  async function loadAll() {
    const T0 = performance.now();
    const mark = (name, t) => loadLog.push([name, Math.round(performance.now() - t)]);
    loadStatus('Reading publication…', 0.02);
    await maybeYield(true);
    const manifest = document.getElementById('cmw-files');
    if (manifest) {
      for (const n of Array.from(manifest.content.children)) {
        if (n.localName === 'x-f') files.push({ k: n.dataset.k, n: +n.dataset.n, src: n.dataset.src, res: n.dataset.res || '', c: +n.dataset.c || 0, state: 'pending' });
        else if (n.localName === 'x-di') addDiagramSkeleton(n);
      }
      manifest.remove();
    }
    const inline = document.getElementById('cmw-data');
    if (inline) {
      inlineMode = true;
      const t = performance.now();
      loadStatus('Reading model…', 0.1);
      await maybeYield(true);
      await ingestFragment(inline.content, 0);
      inline.remove();
      mark('inline data', t);
    }
    // Startup needs only the elements. With diagram skeletons (3.0.4+), diagram details and documentation load
    // later; older publications have no skeletons, so their diagram files are still loaded now.
    const queue = files.filter((f) => f.k === 'e').concat(skeletons ? [] : files.filter((f) => f.k === 'd'));
    const totalItems = queue.reduce((s, f) => s + (f.c || 1), 0) || 1;
    let doneItems = 0;
    for (let i = 0; i < queue.length; i++) {
      const f = queue[i];
      loadStatus((f.k === 'e' ? 'Loading model elements' : 'Loading diagrams') + ' — part ' + (i + 1) + ' of ' + queue.length, 0.05 + 0.85 * (doneItems / totalItems));
      const t = performance.now();
      try { await ingestChunk(f); } catch (err) { console.warn('[CMW] ' + f.src + ': ' + err.message); }
      mark(f.src.split('/').pop(), t);
      doneItems += f.c || 1;
    }
    const t = performance.now();
    loadStatus('Building the model index…', 0.93);
    await maybeYield(true);
    await finalize();
    mark('index', t);
    if (inlineMode || !files.some((f) => f.k === 'p')) for (const r of model.values()) r.propsLoaded = true;
    if (inlineMode || !files.some((f) => f.k === 'o')) for (const r of model.values()) if (!r.isDiagram) r.docLoaded = true;
    if (inlineMode || !skeletons) for (const d of diagrams) { d.detailLoaded = true; d.docLoaded = true; }
    // anything left for the background marks the index as not ready yet (search/"Appears in"/PDF wait for it)
    bg.ready = !backgroundQueue().length;
    loadLog.push(['startup total', Math.round(performance.now() - T0)]);
    console.info('[CMW] loaded ' + model.size + ' records, ' + diagrams.length + ' diagrams in ' + loadLog[loadLog.length - 1][1] + ' ms');
  }

  async function finalize() {
    for (const d of diagrams) {
      const im = images.get(d.id);
      if (im && !d.img) { d.img = im.src; d.imgW = d.imgW || im.w; d.imgH = d.imgH || im.h; }
    }
    let i = 0;
    for (const rec of model.values()) {
      const owner = model.get(rec.owner);
      if (owner && owner !== rec) owner.children.push(rec.id); else roots.push(rec.id);
      if ((++i & 1023) === 0) await maybeYield();
    }
    for (const rec of model.values()) {
      if (!rec.rel || !rec.ends) continue;
      const touch = new Set([...rec.ends.src, ...rec.ends.tgt, ...rec.ends.any].map((e) => e.ref));
      for (const id of touch) model.get(id)?.relations.push(rec.id);
      if ((++i & 1023) === 0) await maybeYield();
    }
    const rank = (r) => (r.virtual ? 4 : r.rel ? 3 : r.isDiagram ? 2 : /package|model|profile/i.test(r.type) ? 0 : 1);
    const cmp = (a, b) => { const A = model.get(a), B = model.get(b); return rank(A) - rank(B) || collator.compare(A.name || A.type, B.name || B.type); };
    for (const rec of [...model.values()]) {
      if (rec.children.length > 1) rec.children.sort(cmp);
      // Tree view: relationships go into a "Relations" folder, like the Cameo containment tree
      const rels = rec.children.filter((id) => model.get(id).rel);
      rec.treeKids = rels.length ? rec.children.filter((id) => !model.get(id).rel) : rec.children;
      if (rels.length) {
        const fid = 'rels:' + rec.id;
        model.set(fid, { id: fid, name: 'Relations', type: 'Relations', virtual: true, relFolder: true, owner: rec.id, children: rels, treeKids: rels, stereos: [], props: [], relations: [], appearsIn: [] });
        rec.treeKids.push(fid);
      }
      if ((++i & 1023) === 0) await maybeYield();
    }
    roots.sort(cmp);
    diagrams.sort((a, b) => collator.compare(a.name, b.name));
  }

  const label = (rec) => (rec ? rec.name || '\u2039' + (rec.type || 'unnamed') + '\u203A' : '');
  function ownerPath(rec) {
    const path = [];
    const seen = new Set();
    let cur = model.get(rec.owner);
    while (cur && !seen.has(cur.id)) { seen.add(cur.id); if (!cur.virtual) path.unshift(cur); cur = model.get(cur.owner); }
    return path;
  }
  const href = (id) => '#/e/' + encodeURIComponent(id);
  const isTable = (rec) => rec?.isDiagram && TABLE_TYPES.test(rec.dtype || '');

  // ------------------------------------------------------------------ documentation sanitizing
  let purifyReady = false;
  function setupPurify() {
    if (!window.DOMPurify || purifyReady) return;
    purifyReady = true;
    window.DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
      if (data.attrName === 'href' && /^mdel:\/\//i.test(data.attrValue)) {
        node.setAttribute('data-mdel', data.attrValue.replace(/^mdel:\/\//i, '').split(/[?#]/)[0]);
        data.attrValue = '#';
      }
    });
    window.DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName !== 'A') return;
      const raw = node.getAttribute('data-mdel');
      if (raw) node.setAttribute('href', href(raw));
      else if (node.hasAttribute('href') && !node.getAttribute('href').startsWith('#')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });
  }
  const looksHtml = (s) => typeof s === 'string' && /<\s*(html|body|p|div|br|span|b|i|u|s|ul|ol|li|table|tr|td|a|img|font|h\d|strong|em|sub|sup|pre|code|blockquote|hr)\b[^>]*>/i.test(s);
  const SANITIZE = { RETURN_DOM_FRAGMENT: true, FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed', 'meta', 'link', 'base'], ADD_ATTR: ['target', 'data-mdel'] };
  /** Sanitized DOM fragment for HTML text from the model (Cameo stores rich text as <html><body>...). */
  function sanitizeHtml(text) {
    setupPurify();
    return window.DOMPurify.sanitize(text, SANITIZE);
  }
  /** Plain text of an HTML string, for labels and search (DOMParser documents never run scripts or load images). */
  function toPlain(s, max) {
    if (!s) return s;
    let t = s;
    if (looksHtml(s)) {
      const doc = new DOMParser().parseFromString(s.replace(/<br\s*\/?>/gi, ' ').replace(/<\/(p|div|li|tr|h\d)>/gi, ' '), 'text/html');
      doc.querySelectorAll('script, style, noscript, template, head, title').forEach((n) => n.remove());
      t = doc.body ? doc.body.textContent || '' : '';
    }
    t = t.replace(/\s+/g, ' ').trim();
    return max && t.length > max ? t.slice(0, max - 1) + '…' : t;
  }
  function renderDoc(text, emptyText = 'No documentation.') {
    if (!text || !text.trim()) return h('p', { class: 'cmw-muted cmw-nodoc' }, emptyText);
    const box = h('div', { class: 'cmw-doc' });
    if (looksHtml(text) && window.DOMPurify) box.append(sanitizeHtml(text));
    else {
      box.classList.add('cmw-doc-plain');
      box.textContent = looksHtml(text) ? toPlain(text) : text;
    }
    return box;
  }
  /** Any text value from the model: HTML -> rendered rich text, image data -> image, otherwise plain text. */
  function richValue(text) {
    if (text == null || text === '') return '';
    const img = imageFromData(text);
    if (img) return h('img', { class: 'cmw-inline-img', src: img, alt: 'Image', loading: 'lazy' });
    if (looksHtml(text)) {
      if (!window.DOMPurify) return toPlain(text);
      const span = h('div', { class: 'cmw-rich' });
      span.append(sanitizeHtml(text));
      return span;
    }
    return text;
  }

  // ------------------------------------------------------------------ images stored in the model (CustomImageHolder, UML Image)
  const MIME = { svg: 'image/svg+xml', png: 'image/png', gif: 'image/gif', jpg: 'image/jpeg', jpeg: 'image/jpeg', bmp: 'image/bmp', webp: 'image/webp', ico: 'image/x-icon' };
  /** Recognise base64 image data by its first bytes. */
  function sniffBase64(b64) {
    if (b64.startsWith('iVBORw0KGgo')) return 'image/png';
    if (b64.startsWith('/9j/')) return 'image/jpeg';
    if (b64.startsWith('R0lGOD')) return 'image/gif';
    if (b64.startsWith('UklGR')) return 'image/webp';
    if (b64.startsWith('Qk')) return 'image/bmp';
    if (b64.startsWith('PHN2Zy') || b64.startsWith('PD94bWwg')) return 'image/svg+xml';
    return null;
  }
  /**
   * Build an image URL from UML Image / «CustomImageHolder» data: content is serialized per format
   * ("PNG", "GIF", "JPEG" -> base64; "SVG" -> SVG text; "MIME: image/png" etc.). Location may be a URL.
   */
  function imageSrc(content, format, location) {
    content = (content || '').trim();
    const f = (format || '').trim().toLowerCase();
    let mime = (f.match(/^mime:\s*([\w.+-]+\/[\w.+-]+)/) || [])[1] || MIME[f.replace(/^\./, '')] || null;
    if (content) {
      if ((!mime || mime === 'image/svg+xml') && /^(<\?xml|<svg)/i.test(content)) return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(content);
      const b64 = content.replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
      if (/^[A-Za-z0-9+/]+=*$/.test(b64) && b64.length >= 16) {
        mime = mime && mime !== 'image/svg+xml' ? mime : sniffBase64(b64) || mime;
        if (mime) return 'data:' + mime + ';base64,' + b64;
      }
    }
    const loc = (location || '').trim();
    if (/^(https?:|data:image\/)/i.test(loc)) return loc;
    if (/^file:/i.test(loc) || /^[a-z]:[\\/]/i.test(loc)) return loc.replace(/\\/g, '/').replace(/^([a-z]:)/i, 'file:///$1');
    return null;
  }
  /** A long base64 value that starts like an image file (used for values outside CustomImageHolder). */
  function imageFromData(text) {
    if (typeof text !== 'string' || text.length < 64) return null;
    const t = text.trim();
    if (/^data:image\/[\w.+-]+;base64,/i.test(t)) return t.replace(/\s+/g, '');
    const b64 = t.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/]+=*$/.test(b64)) return null;
    const mime = sniffBase64(b64);
    return mime ? 'data:' + mime + ';base64,' + b64 : null;
  }
  const IMAGE_HOLDER = /^(CustomImageHolder|Image)$/i;
  /** {src, format, location} for an element's «CustomImageHolder» stereotype, if any. */
  function customImage(rec) {
    const st = rec.stereos.find((x) => IMAGE_HOLDER.test(x.name) && x.tags.some((t) => /^(content|customImage|image)$/i.test(t.name)));
    if (!st) return null;
    const tag = (n) => (st.tags.find((t) => t.name.toLowerCase() === n) || {}).value || '';
    const content = tag('content') || tag('customimage') || tag('image');
    const src = imageSrc(content, tag('format'), tag('location'));
    return { src, format: tag('format'), location: tag('location'), stereo: st.name };
  }
  /** Tagged-value rows with image data and HTML rendered; raw image encodings are never shown. */
  function tagRows(s) {
    if (IMAGE_HOLDER.test(s.name)) return s.tags.filter((t) => !/^(content|customImage|image)$/i.test(t.name)).map((t) => [t.name, t.value]);
    return s.tags.map((t) => [t.name, richValue(t.value)]);
  }

  // ------------------------------------------------------------------ themes
  const THEMES = [
    { id: 'system', name: 'System', icon: 'system' },
    { id: 'light', name: 'Light', icon: 'sun' },
    { id: 'dark', name: 'Dark', icon: 'moon' },
    { id: 'kawaii', name: 'Kawaii', icon: 'heart' }
  ];
  function applyTheme(id) {
    if (!THEMES.some((t) => t.id === id)) id = 'system';
    if (id === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = id;
    storage.set('cmw3:theme', id);
    document.querySelectorAll('.cmw-theme-menu [role="menuitemradio"]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.theme === id)));
    const btn = $('.cmw-theme-btn');
    if (btn) btn.replaceChildren(uiIcon(THEMES.find((t) => t.id === id).icon), h('span', { class: 'cmw-hide-narrow' }, THEMES.find((t) => t.id === id).name));
  }
  applyTheme(storage.get('cmw3:theme', 'system'));

  // ------------------------------------------------------------------ app shell
  const app = document.getElementById('cmw-app');
  let treeView, diagramView, favView, content, searchInput, sidebar, suggest;
  let activeTab = storage.get(storeKey + 'tab', 'containment');
  const favorites = new Set(storage.get(storeKey + 'favorites', []));
  let currentId = null;

  function buildShell() {
    app.className = '';
    app.removeAttribute('aria-busy');
    app.textContent = '';

    searchInput = h('input', {
      type: 'search', id: 'cmw-search', placeholder: 'Search model', autocomplete: 'off', spellcheck: 'false',
      'aria-label': 'Search model', 'aria-controls': 'cmw-suggest', 'aria-autocomplete': 'list'
    });
    suggest = h('ul', { id: 'cmw-suggest', class: 'cmw-suggest', role: 'listbox', hidden: true });

    const themeMenu = h('div', { class: 'cmw-theme-menu', role: 'menu', hidden: true, 'aria-label': 'Theme' },
      THEMES.map((t) => h('button', { role: 'menuitemradio', 'aria-checked': 'false', dataset: { theme: t.id },
        onclick: () => { applyTheme(t.id); themeMenu.hidden = true; } }, uiIcon(t.icon), t.name)));
    const themeBtn = h('button', { class: 'cmw-btn cmw-theme-btn', 'aria-haspopup': 'menu', title: 'Theme',
      onclick: (ev) => { ev.stopPropagation(); themeMenu.hidden = !themeMenu.hidden; themeMenu.querySelector('[aria-checked="true"]')?.focus(); } });
    document.addEventListener('click', (ev) => { if (!themeMenu.hidden && !themeMenu.contains(ev.target)) themeMenu.hidden = true; });

    const header = h('header', { class: 'cmw-header' },
      h('button', { class: 'cmw-btn cmw-only-narrow', title: 'Model browser', 'aria-label': 'Show model browser', onclick: () => document.body.classList.toggle('cmw-nav-open') }, uiIcon('menu')),
      h('a', { class: 'cmw-brand', href: '#/', title: 'Home' },
        cfg.logo ? h('img', { src: cfg.logo, alt: '', width: 26, height: 26 }) : null,
        h('span', { class: 'cmw-brand-text' }, h('strong', null, 'CATIA Magic'), ' Web')),
      h('span', { class: 'cmw-title', title: cfg.projectFile || cfg.title }, cfg.title),
      h('form', { class: 'cmw-searchbox', role: 'search', onsubmit: (ev) => { ev.preventDefault(); runSearch(searchInput.value); } },
        uiIcon('search'), searchInput, h('kbd', { class: 'cmw-kbd', 'aria-hidden': 'true' }, '/'), suggest),
      h('nav', { class: 'cmw-hdr-actions', 'aria-label': 'Page' },
        h('button', { class: 'cmw-btn', title: 'Back', 'aria-label': 'Back', onclick: () => history.back() }, uiIcon('back')),
        h('button', { class: 'cmw-btn', title: 'Forward', 'aria-label': 'Forward', onclick: () => history.forward() }, uiIcon('fwd')),
        h('button', { class: 'cmw-btn', title: 'Export PDF', onclick: () => openPdfDialog() }, uiIcon('pdf'), h('span', { class: 'cmw-hide-narrow' }, 'PDF')),
        h('span', { class: 'cmw-theme-wrap' }, themeBtn, themeMenu)));

    const tabs = h('div', { class: 'cmw-tabs', role: 'tablist', 'aria-label': 'Browser' },
      tabButton('containment', 'Model'), tabButton('diagrams', 'Diagrams'), tabButton('favorites', 'Favorites'));
    const tools = h('div', { class: 'cmw-treetools' },
      h('input', { type: 'search', class: 'cmw-filter', placeholder: 'Filter', 'aria-label': 'Filter tree', oninput: (ev) => activeTree().filter(ev.target.value) }),
      h('button', { class: 'cmw-btn cmw-sm', title: 'Show current element in tree', 'aria-label': 'Locate current element', onclick: () => currentId && revealInTree(currentId, true) }, uiIcon('locate')),
      h('button', { class: 'cmw-btn cmw-sm', title: 'Collapse all', 'aria-label': 'Collapse all', onclick: () => activeTree().collapseAll() }, uiIcon('collapse')));

    treeView = new TreeView('containment', () => roots, (rec) => rec.treeKids || []);
    diagramView = new TreeView('diagrams', diagramGroups, (rec) => rec.children || []);
    favView = new TreeView('favorites', () => [...favorites].filter((id) => model.has(id)), () => []);

    sidebar = h('aside', { class: 'cmw-sidebar', 'aria-label': 'Model browser' }, tabs, tools,
      h('div', { class: 'cmw-trees' }, treeView.el, diagramView.el, favView.el),
      h('div', { id: 'cmw-indexing', class: 'cmw-indexing', role: 'status', hidden: true }, h('span', { class: 'cmw-spin cmw-spin-sm' }), h('span', null, '')),
      h('footer', { class: 'cmw-side-foot' }, h('a', { href: '#/about', title: 'About this publication' }, 'CATIA Magic Web ' + VERSION), cfg.generated ? ' \u00B7 ' + cfg.generated : ''));
    const splitter = h('div', { class: 'cmw-splitter', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Resize model browser', tabindex: '0' });
    content = h('main', { class: 'cmw-content', id: 'cmw-content', tabindex: '-1' });
    app.append(header, h('div', { class: 'cmw-body' }, sidebar, splitter, content), h('div', { class: 'cmw-scrim', onclick: () => document.body.classList.remove('cmw-nav-open') }));

    const width = storage.get('cmw3:sidebar', 0);
    if (width) document.documentElement.style.setProperty('--cmw-sidebar', width + 'px');
    setupSplitter(splitter);
    setupSearchSuggest();
    applyTheme(storage.get('cmw3:theme', 'system'));
    showTab(activeTab);
  }

  function tabButton(id, text) {
    return h('button', { role: 'tab', id: 'cmw-tab-' + id, class: 'cmw-tab', 'aria-controls': 'cmw-tree-' + id, onclick: () => showTab(id) }, text);
  }
  function showTab(id) {
    if (!['containment', 'diagrams', 'favorites'].includes(id)) id = 'containment';
    activeTab = id;
    storage.set(storeKey + 'tab', id);
    for (const v of [treeView, diagramView, favView]) {
      const on = v.name === id;
      v.el.hidden = !on;
      const t = document.getElementById('cmw-tab-' + v.name);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      if (on) v.ensureRendered();
    }
    if (id === 'favorites') favView.refresh();
    if (currentId) activeTree().select(currentId, true);
  }
  const activeTree = () => (activeTab === 'diagrams' ? diagramView : activeTab === 'favorites' ? favView : treeView);

  function diagramGroups() {
    const groups = new Map();
    for (const d of diagrams) {
      const t = d.dtype || 'Diagram';
      if (!groups.has(t)) groups.set(t, []);
      groups.get(t).push(d.id);
    }
    return [...groups.keys()].sort(collator.compare).map((t) => {
      const id = 'group:' + t;
      if (!model.has(id)) model.set(id, { id, name: t, type: 'Diagram type', virtual: true, children: groups.get(t), stereos: [], props: [], relations: [], appearsIn: [] });
      return id;
    });
  }

  function setupSplitter(sp) {
    const root = document.documentElement;
    const setW = (w) => {
      w = Math.max(220, Math.min(w, window.innerWidth * 0.6));
      root.style.setProperty('--cmw-sidebar', w + 'px');
      storage.set('cmw3:sidebar', Math.round(w));
    };
    sp.addEventListener('pointerdown', (ev) => {
      sp.setPointerCapture(ev.pointerId);
      document.body.classList.add('cmw-resizing');
      const move = (e) => setW(e.clientX);
      const up = () => { sp.removeEventListener('pointermove', move); document.body.classList.remove('cmw-resizing'); };
      sp.addEventListener('pointermove', move);
      sp.addEventListener('pointerup', up, { once: true });
      sp.addEventListener('pointercancel', up, { once: true });
    });
    sp.addEventListener('keydown', (ev) => {
      const cur = sidebar.getBoundingClientRect().width;
      if (ev.key === 'ArrowLeft') { setW(cur - 24); ev.preventDefault(); }
      if (ev.key === 'ArrowRight') { setW(cur + 24); ev.preventDefault(); }
    });
  }

  // ------------------------------------------------------------------ tree view (lazy, keyboard accessible)
  class TreeView {
    constructor(name, rootsFn, childrenFn) {
      this.name = name;
      this.rootsFn = rootsFn;
      this.childrenFn = childrenFn;
      this.rendered = false;
      this.items = new Map();
      this.el = h('ul', { class: 'cmw-tree', role: 'tree', id: 'cmw-tree-' + name, 'aria-label': name, hidden: true });
      this.el.addEventListener('click', (ev) => this.onClick(ev));
      this.el.addEventListener('keydown', (ev) => this.onKey(ev));
    }
    ensureRendered() { if (!this.rendered) this.refresh(); }
    refresh() {
      this.rendered = true;
      this.items.clear();
      this.el.textContent = '';
      this.el._shown = 0;
      const ids = this.rootsFn();
      if (!ids.length) {
        this.el.append(h('li', { class: 'cmw-empty', role: 'none' }, this.name === 'favorites' ? 'No favorites yet. Use the star on any element page.' : 'Nothing to show.'));
        return;
      }
      this.renderKids(this.el, ids, 1);
      const first = this.el.querySelector('[role="treeitem"]');
      if (first) first.tabIndex = 0;
      if (this.name === 'containment') ids.filter((id) => !model.get(id).rel).slice(0, 2).forEach((id) => this.expand(this.items.get(id)));
      if (currentId) this.select(currentId, false);
    }
    /** Render children in pages so huge packages never freeze the page. */
    renderKids(ul, ids, level, until) {
      const PAGE = 300;
      let shown = ul._shown || 0;
      ul.querySelector(':scope > .cmw-more')?.remove();
      const want = until ? Math.max(ids.indexOf(until) + 1, shown + PAGE) : shown + PAGE;
      const frag = document.createDocumentFragment();
      for (; shown < Math.min(want, ids.length); shown++) frag.append(this.item(ids[shown], level));
      ul.append(frag);
      ul._shown = shown;
      if (shown < ids.length) {
        const rest = ids.length - shown;
        ul.append(h('li', { class: 'cmw-more', role: 'none' }, h('button', {
          class: 'cmw-more-btn', style: '--lvl:' + (level - 1),
          onclick: (ev) => { ev.stopPropagation(); this.renderKids(ul, ids, level); if (this.filterText) this.applyFilter(ul); }
        }, 'Show ' + Math.min(PAGE, rest).toLocaleString() + ' more (' + rest.toLocaleString() + ' remaining)')));
      }
      if (this.filterText) this.applyFilter(ul);
    }
    item(id, level) {
      const rec = model.get(id);
      const kids = this.childrenFn(rec) || [];
      const li = h('li', { role: 'treeitem', 'aria-level': level, tabindex: '-1', dataset: { id } });
      if (kids.length) li.setAttribute('aria-expanded', 'false');
      const row = h('div', { class: 'cmw-row', style: '--lvl:' + (level - 1) },
        h('span', { class: 'cmw-twisty', 'aria-hidden': 'true' }),
        icon(rec),
        h('span', { class: 'cmw-label' },
          cfg.treeStereotypes && visibleStereos(rec).length ? h('span', { class: 'cmw-stereo' }, '\u00AB' + visibleStereos(rec).map((s) => s.name).join(', ') + '\u00BB ') : null,
          label(rec),
          rec.virtual ? h('span', { class: 'cmw-count' }, kids.length) : null,
          cfg.treeIds && !rec.virtual ? h('span', { class: 'cmw-id' }, ' ' + rec.id) : null));
      row.title = rec.virtual ? rec.name : label(rec) + ' \u2014 ' + rec.type;
      li.append(row);
      this.items.set(id, li);
      return li;
    }
    expand(li, until) {
      if (!li) return;
      const rec = model.get(li.dataset.id);
      const ids = this.childrenFn(rec) || [];
      if (li.getAttribute('aria-expanded') === 'false') li.setAttribute('aria-expanded', 'true');
      let ul = li.querySelector(':scope > ul');
      if (!ul) { ul = h('ul', { role: 'group' }); li.append(ul); this.renderKids(ul, ids, +li.getAttribute('aria-level') + 1, until); }
      else if (until && !this.items.has(until)) this.renderKids(ul, ids, +li.getAttribute('aria-level') + 1, until);
    }
    collapse(li) { if (li && li.getAttribute('aria-expanded') === 'true') li.setAttribute('aria-expanded', 'false'); }
    collapseAll() { this.el.querySelectorAll('[aria-expanded="true"]').forEach((li) => li.setAttribute('aria-expanded', 'false')); }
    onClick(ev) {
      const li = ev.target.closest('[role="treeitem"]');
      if (!li) return;
      if (ev.target.closest('.cmw-twisty') || model.get(li.dataset.id)?.virtual) {
        li.getAttribute('aria-expanded') === 'true' ? this.collapse(li) : this.expand(li);
        this.focus(li);
        return;
      }
      this.focus(li);
      go(li.dataset.id);
      document.body.classList.remove('cmw-nav-open');
    }
    visibleItems() { return Array.from(this.el.querySelectorAll('[role="treeitem"]')).filter((li) => li.offsetParent !== null); }
    focus(li) {
      this.el.querySelectorAll('[role="treeitem"][tabindex="0"]').forEach((x) => (x.tabIndex = -1));
      li.tabIndex = 0;
      li.focus({ preventScroll: false });
    }
    onKey(ev) {
      const li = ev.target.closest('[role="treeitem"]');
      if (!li) return;
      const items = this.visibleItems();
      const i = items.indexOf(li);
      const exp = li.getAttribute('aria-expanded');
      switch (ev.key) {
        case 'ArrowDown': if (items[i + 1]) this.focus(items[i + 1]); break;
        case 'ArrowUp': if (items[i - 1]) this.focus(items[i - 1]); break;
        case 'ArrowRight': if (exp === 'false') this.expand(li); else if (exp === 'true') { const c = li.querySelector('[role="treeitem"]'); if (c) this.focus(c); } break;
        case 'ArrowLeft': if (exp === 'true') this.collapse(li); else { const p = li.parentElement.closest('[role="treeitem"]'); if (p) this.focus(p); } break;
        case 'Home': if (items[0]) this.focus(items[0]); break;
        case 'End': if (items.length) this.focus(items[items.length - 1]); break;
        case 'Enter': case ' ': if (model.get(li.dataset.id)?.virtual) exp === 'true' ? this.collapse(li) : this.expand(li); else go(li.dataset.id); break;
        default: return;
      }
      ev.preventDefault();
    }
    select(id, scroll) {
      this.el.querySelectorAll('.cmw-selected').forEach((x) => x.classList.remove('cmw-selected'));
      let li = this.items.get(id);
      const rec = model.get(id);
      if (!li && rec && this.name === 'containment') {
        const chain = ownerPath(rec).map((a) => a.id);
        if (rec.rel) chain.push('rels:' + rec.owner);
        chain.push(id);
        if (!this.items.has(chain[0])) this.renderKids(this.el, this.rootsFn(), 1, chain[0]);
        for (let k = 0; k < chain.length - 1; k++) this.expand(this.items.get(chain[k]), chain[k + 1]);
        li = this.items.get(id);
      }
      if (!li && rec?.isDiagram && this.name === 'diagrams') { this.expand(this.items.get('group:' + (rec.dtype || 'Diagram')), id); li = this.items.get(id); }
      if (!li) return null;
      li.classList.add('cmw-selected');
      if (scroll) li.querySelector('.cmw-row').scrollIntoView({ block: 'nearest' });
      return li;
    }
    filter(text) { this.filterText = text.trim().toLowerCase(); this.applyFilter(this.el); }
    applyFilter(scope) {
      const t = this.filterText;
      scope.querySelectorAll('[role="treeitem"]').forEach((li) => li.classList.toggle('cmw-dim', !!t && !label(model.get(li.dataset.id)).toLowerCase().includes(t)));
    }
  }
  function revealInTree(id, scroll) {
    const rec = model.get(id);
    if (!rec) return;
    if (rec.isDiagram && activeTab === 'diagrams') { diagramView.select(id, scroll); return; }
    if (activeTab === 'favorites' && favView.select(id, scroll)) return;
    if (activeTab !== 'containment') showTab('containment');
    treeView.select(id, scroll);
  }

  // ------------------------------------------------------------------ search
  function matcher(q) {
    q = q.trim();
    const m = q.match(/^\/(.+)\/([imsu]*)$/);
    if (m) { try { const re = new RegExp(m[1], m[2].includes('i') ? m[2] : m[2] + 'i'); return (s) => re.test(s); } catch { /* fall through */ } }
    const needle = q.toLowerCase();
    return (s) => s.toLowerCase().includes(needle);
  }
  function search(q, { docs = false, limit = Infinity } = {}) {
    if (!q.trim()) return [];
    const test = matcher(q);
    const out = [];
    for (const rec of model.values()) {
      if (rec.virtual) continue;
      let score = 0;
      if (test(rec.name)) score = rec.name.toLowerCase() === q.trim().toLowerCase() ? 3 : 2;
      else if (rec.stereos.some((s) => test(s.name)) || test(rec.type)) score = 1;
      else if (docs && ((rec.doc && test(rec.doc)) || (rec.body && test(rec.body)))) score = 0.5;
      if (score) out.push([score - (rec.rel ? 0.4 : 0), rec]);
    }
    out.sort((a, b) => b[0] - a[0] || collator.compare(a[1].name, b[1].name));
    return out.slice(0, limit).map((x) => x[1]);
  }
  function runSearch(q) { suggest.hidden = true; if (q.trim()) location.hash = '#/search/' + encodeURIComponent(q.trim()); }
  function setupSearchSuggest() {
    let sel = -1;
    const render = () => {
      const q = searchInput.value;
      suggest.textContent = '';
      sel = -1;
      if (!q.trim()) { suggest.hidden = true; return; }
      for (const rec of search(q, { limit: 10 })) {
        suggest.append(h('li', { role: 'option', dataset: { id: rec.id } }, icon(rec), h('span', { class: 'cmw-sname' }, label(rec)), h('span', { class: 'cmw-stype' }, rec.type)));
      }
      suggest.append(h('li', { role: 'option', class: 'cmw-sall', dataset: { all: '1' } }, 'All results for \u201C' + q.trim() + '\u201D'));
      suggest.hidden = false;
    };
    let timer;
    searchInput.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 120); });
    searchInput.addEventListener('keydown', (ev) => {
      const opts = Array.from(suggest.children);
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        if (suggest.hidden) render();
        sel = (sel + (ev.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
        opts.forEach((o, i) => o.setAttribute('aria-selected', i === sel ? 'true' : 'false'));
        ev.preventDefault();
      } else if (ev.key === 'Enter' && sel >= 0 && opts[sel] && !opts[sel].dataset.all) {
        ev.preventDefault(); suggest.hidden = true; go(opts[sel].dataset.id);
      } else if (ev.key === 'Escape') suggest.hidden = true;
    });
    suggest.addEventListener('mousedown', (ev) => {
      const li = ev.target.closest('li');
      if (!li) return;
      ev.preventDefault();
      suggest.hidden = true;
      if (li.dataset.all) runSearch(searchInput.value); else go(li.dataset.id);
    });
    searchInput.addEventListener('blur', () => setTimeout(() => (suggest.hidden = true), 150));
    document.addEventListener('keydown', (ev) => {
      if (ev.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName || '')) { ev.preventDefault(); searchInput.focus(); searchInput.select(); }
    });
  }

  // ------------------------------------------------------------------ routing
  function go(id) { location.hash = href(id); }
  function route() {
    hideContextMenu();
    if (suggest) suggest.hidden = true;
    document.body.classList.remove('cmw-book-mode');
    const hash = location.hash || '';
    let m;
    if ((m = hash.match(/^#\/e\/(.+)$/))) return showElement(decodeURIComponent(m[1]));
    if ((m = hash.match(/^#\/search\/(.*)$/))) return showSearch(decodeURIComponent(m[1]));
    if ((m = hash.match(/^#\/book\/(all|branch)\/([^/]*)\/?([a-z]*)$/))) return showBook(m[1], decodeURIComponent(m[2]), m[3]);
    if (hash === '#/about') return showAbout();
    const refid = new URLSearchParams(location.search).get('refid');
    if (refid && !hash) { history.replaceState(null, '', href(refid)); return showElement(refid); }
    return showHome();
  }
  function setContent(nodes, title) {
    content.textContent = '';
    append(content, [nodes]);
    content.scrollTop = 0;
    document.title = (title ? title + ' \u2013 ' : '') + cfg.title;
  }

  // ------------------------------------------------------------------ home
  function showHome() {
    currentId = null;
    activeTree().select('', false);
    if (!showHome.stats) {
      let el = 0, rel = 0;
      for (const r of model.values()) { if (r.virtual) continue; if (r.rel) rel++; else if (!r.isDiagram) el++; }
      showHome.stats = { el, rel };
    }
    const { el: elementCount, rel: relCount } = showHome.stats;
    const homeDiag = cfg.homeDiagram && model.get(cfg.homeDiagram);
    if (homeDiag && !homeDiag.detailLoaded) { // clickable shapes need the diagram's details
      const hash = location.hash;
      ensureDiagram(homeDiag).then(() => { if (location.hash === hash) showHome(); });
    }
    const stat = (n, t) => h('div', { class: 'cmw-stat' }, h('span', { class: 'cmw-stat-n' }, n.toLocaleString()), h('span', { class: 'cmw-stat-t' }, t));
    const hero = h('section', { class: 'cmw-hero' },
      h('div', { class: 'cmw-hero-text' },
        h('p', { class: 'cmw-eyebrow' }, 'Model publication'),
        h('h1', null, cfg.title),
        h('p', { class: 'cmw-byline' }, [cfg.projectFile ? cfg.projectFile.replace(/\s*\[[^\]]*\]\s*$/, '') : null, cfg.author ? 'By ' + cfg.author : null, cfg.generated ? 'Published ' + cfg.generated : null].filter(Boolean).join(' · ')),
        h('div', { class: 'cmw-stats' }, stat(elementCount, 'elements'), stat(diagrams.length, 'diagrams'), stat(relCount, 'relationships'),
          h('div', { class: 'cmw-hero-actions' },
            h('button', { class: 'cmw-btn cmw-btn-solid', onclick: () => openPdfDialog('all') }, uiIcon('pdf'), 'Export PDF'),
            h('button', { class: 'cmw-btn cmw-btn-ghost', onclick: () => searchInput.focus() }, uiIcon('search'), 'Search')))),
      cfg.homeImage ? h('img', { class: 'cmw-hero-img', src: cfg.homeImage, alt: '' }) : h('div', { class: 'cmw-hero-art', 'aria-hidden': 'true' }));

    const top = [];
    for (const id of roots) {
      const r = model.get(id);
      if (r.rel) continue;
      top.push(r);
      if (/model/i.test(r.type)) for (const cid of r.treeKids) { const c = model.get(cid); if (!c.virtual && !c.isDiagram && /package|model|profile/i.test(c.type)) top.push(c); }
    }
    const diagSection = h('section', { class: 'cmw-block' });
    const renderDiagrams = () => {
      const previews = storage.get('cmw3:previews', cfg.previews);
      const toggle = h('label', { class: 'cmw-switch', title: 'Thumbnails load one at a time as you scroll' },
        h('input', { type: 'checkbox', role: 'switch', checked: previews, onchange: (ev) => { storage.set('cmw3:previews', ev.target.checked); renderDiagrams(); } }),
        h('span', { class: 'cmw-switch-ui', 'aria-hidden': 'true' }), 'Show previews');
      diagSection.replaceChildren(
        h('div', { class: 'cmw-block-head' }, h('h2', null, 'Diagrams'), h('span', { class: 'cmw-muted' }, diagrams.length.toLocaleString() + ' total'), h('span', { class: 'cmw-grow' }), toggle),
        ...(previews ? previewGallery() : [diagramTypeList()]));
    };
    if (diagrams.length) renderDiagrams();
    const TILE_MAX = 12;
    setContent([
      hero,
      homeDiag ? h('section', { class: 'cmw-card cmw-pad0' }, diagramViewer(homeDiag)) : null,
      diagrams.length ? diagSection : null,
      top.length ? h('section', { class: 'cmw-block' }, h('div', { class: 'cmw-block-head' }, h('h2', null, 'Packages'), top.length > TILE_MAX ? h('span', { class: 'cmw-muted' }, 'showing ' + TILE_MAX + ' of ' + top.length) : null),
        h('div', { class: 'cmw-tiles' }, top.slice(0, TILE_MAX).map((r) => h('a', { class: 'cmw-tile', href: href(r.id) }, icon(r), h('span', { class: 'cmw-tile-n' }, label(r)),
          h('span', { class: 'cmw-tile-t' }, r.treeKids.filter((k) => !model.get(k).virtual).length.toLocaleString() + ' items'))))) : null,
      favorites.size ? h('section', { class: 'cmw-block' }, h('div', { class: 'cmw-block-head' }, h('h2', null, 'Favorites')),
        h('div', { class: 'cmw-tiles' }, [...favorites].map((id) => model.get(id)).filter(Boolean).slice(0, 24).map((r) => h('a', { class: 'cmw-tile', href: href(r.id) }, icon(r), h('span', { class: 'cmw-tile-n' }, label(r)), h('span', { class: 'cmw-tile-t' }, r.type))))) : null
    ]);
  }
  /** Compact, image-free overview: one card per diagram type with a few links. */
  function diagramTypeList() {
    const groups = new Map();
    for (const d of diagrams) { const t = d.dtype || 'Diagram'; if (!groups.has(t)) groups.set(t, []); groups.get(t).push(d); }
    const openGroup = (t) => { showTab('diagrams'); const g = diagramView.items.get('group:' + t); diagramView.expand(g); g?.scrollIntoView({ block: 'nearest' }); document.body.classList.add('cmw-nav-open'); };
    return h('div', { class: 'cmw-typegrid' }, [...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([t, list]) =>
      h('div', { class: 'cmw-typecard' },
        h('div', { class: 'cmw-typehead' }, icon(list[0]), h('span', { class: 'cmw-typename' }, shortType(t)), h('span', { class: 'cmw-count' }, list.length)),
        h('ul', { class: 'cmw-links' }, list.slice(0, 5).map((d) => h('li', null, h('a', { href: href(d.id), class: 'cmw-ref' }, h('span', null, label(d)))))),
        list.length > 5 ? h('button', { class: 'cmw-linkbtn', onclick: () => openGroup(t) }, 'All ' + list.length.toLocaleString() + ' →') : null)));
  }
  /** Thumbnails: rendered in pages of 12, images load one at a time and only when scrolled into view. */
  function previewGallery() {
    const grid = h('div', { class: 'cmw-gallery' });
    let shown = 0;
    const queue = [];
    let busy = false;
    const pump = () => {
      if (busy || !queue.length) return;
      const { thumb, d } = queue.shift();
      if (!thumb.isConnected) return pump();
      busy = true;
      const img = h('img', { alt: '', decoding: 'async' });
      const finish = (ok) => { busy = false; thumb.classList.remove('cmw-thumb-loading'); if (!ok) thumb.replaceChildren(icon(d, 'cmw-icon-xl')); setTimeout(pump, 30); };
      img.onload = () => { thumb.replaceChildren(img); finish(true); };
      img.onerror = () => finish(false);
      img.src = d.img;
    };
    const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) { io.unobserve(en.target); queue.push(en.target._job); pump(); }
    }, { rootMargin: '200px' }) : null;
    const more = h('button', { class: 'cmw-btn cmw-btn-ghost cmw-more-wide', onclick: () => page() });
    const page = () => {
      const next = diagrams.slice(shown, shown + 12);
      shown += next.length;
      for (const d of next) {
        const owner = model.get(d.owner);
        const thumb = h('div', { class: 'cmw-thumb' + (d.img ? ' cmw-thumb-loading' : '') }, d.img ? h('span', { class: 'cmw-spin', 'aria-label': 'Loading preview' }) : icon(d, 'cmw-icon-xl'));
        grid.append(h('a', { class: 'cmw-gcard', href: href(d.id) }, thumb,
          h('div', { class: 'cmw-gmeta' }, h('span', { class: 'cmw-gname' }, label(d)), h('span', { class: 'cmw-gtype' }, shortType(d.dtype), owner ? ' · ' + label(owner) : ''))));
        if (d.img) { thumb._job = { thumb, d }; io ? io.observe(thumb) : (queue.push(thumb._job), pump()); }
      }
      more.textContent = 'Show more (' + (diagrams.length - shown).toLocaleString() + ' remaining)';
      more.hidden = shown >= diagrams.length;
    };
    page();
    return [grid, more];
  }
  const shortType = (t) => (t || 'Diagram').replace(/^SysML\s+/i, '').replace(/^UML\s+/i, '');

  // ------------------------------------------------------------------ search page
  function showSearch(q) {
    currentId = null;
    searchInput.value = q;
    const docsBox = h('input', { type: 'checkbox', id: 'cmw-sdocs', checked: storage.get('cmw3:sdocs', false) });
    const list = h('ul', { class: 'cmw-results' });
    const status = h('p', { class: 'cmw-muted', role: 'status' });
    const run = () => {
      storage.set('cmw3:sdocs', docsBox.checked);
      if (docsBox.checked && !indexed()) {
        const hash = location.hash;
        whenIndexed().then(() => { if (location.hash === hash) run(); });
      }
      const hits = search(q, { docs: docsBox.checked });
      list.textContent = '';
      status.textContent = hits.length.toLocaleString() + ' result' + (hits.length === 1 ? '' : 's') + (hits.length > 500 ? ' (showing first 500)' : '') +
        (docsBox.checked && !indexed() ? ' so far \u2014 still indexing documentation, results will update' : '');
      for (const rec of hits.slice(0, 500)) {
        const path = ownerPath(rec).map(label).join(' \u203A ');
        list.append(h('li', null, h('a', { href: href(rec.id) }, icon(rec), h('span', { class: 'cmw-rname' }, label(rec))),
          h('span', { class: 'cmw-pill' }, rec.type), path ? h('div', { class: 'cmw-rpath' }, path) : null));
      }
    };
    docsBox.addEventListener('change', run);
    run();
    setContent([
      h('header', { class: 'cmw-page-head' }, h('h1', { class: 'cmw-h1' }, 'Results for ', h('q', null, q))),
      h('div', { class: 'cmw-card' },
        h('p', { class: 'cmw-searchopts' }, h('label', null, docsBox, ' Include documentation'), h('span', { class: 'cmw-muted' }, 'Tip: /^REQ-\\d+/ searches with a regular expression')),
        status, list)
    ], 'Search');
  }

  // ------------------------------------------------------------------ element page
  function linkTo(id, text) {
    const rec = model.get(id);
    if (!rec) return h('span', { class: 'cmw-ext', title: 'Not included in this publication' }, text || id);
    return h('a', { href: href(id), class: 'cmw-ref' }, icon(rec), h('span', null, label(rec)));
  }

  function showElement(id) {
    const rec = model.get(id);
    if (!rec || rec.virtual) {
      setContent(h('section', { class: 'cmw-card' }, h('h1', { class: 'cmw-h1' }, 'Element not found'),
        h('p', null, 'The element ', h('code', null, id), ' is not part of this publication.'), h('p', null, h('a', { href: '#/' }, 'Back to home'))), 'Not found');
      return;
    }
    currentId = id;
    revealInTree(id, true);
    if (!rec.docLoaded || (rec.isDiagram && !rec.detailLoaded)) {
      const hash = location.hash;
      const pending = rec.isDiagram ? ensureDiagram(rec) : ensureDocs(rec);
      const shown = setTimeout(() => setContent(h('section', { class: 'cmw-card' }, spinnerBlock('Loading ' + label(rec) + '\u2026')), label(rec)), 120);
      pending.then(() => { clearTimeout(shown); if (location.hash === hash) showElement(id); });
      return;
    }

    const favBtn = h('button', {
      class: 'cmw-btn cmw-fav' + (favorites.has(id) ? ' cmw-on' : ''), 'aria-pressed': String(favorites.has(id)), title: 'Favorite',
      onclick: () => {
        favorites.has(id) ? favorites.delete(id) : favorites.add(id);
        storage.set(storeKey + 'favorites', [...favorites]);
        favBtn.classList.toggle('cmw-on', favorites.has(id));
        favBtn.setAttribute('aria-pressed', String(favorites.has(id)));
        favView.rendered = false;
        if (activeTab === 'favorites') favView.refresh();
      }
    }, uiIcon('star'));
    const head = h('header', { class: 'cmw-page-head' },
      h('nav', { class: 'cmw-crumbs', 'aria-label': 'Owner path' }, h('ol', null, ownerPath(rec).map((o) => h('li', null, h('a', { href: href(o.id) }, label(o)))))),
      h('div', { class: 'cmw-titlerow' }, icon(rec, 'cmw-icon-lg'),
        h('div', { class: 'cmw-titles' },
          h('h1', { class: 'cmw-h1' }, label(rec)),
          h('div', { class: 'cmw-subtitle' }, h('span', { class: 'cmw-pill' }, rec.type), visibleStereos(rec).map((s) => h('span', { class: 'cmw-chip' }, '\u00AB' + s.name + '\u00BB')))),
        h('div', { class: 'cmw-actions' },
          h('button', { class: 'cmw-btn', title: 'Copy link', onclick: () => copy(location.href, 'Link copied') }, uiIcon('link')),
          h('button', { class: 'cmw-btn', title: 'Export this element to PDF', onclick: () => openPdfDialog(rec.children.length ? 'branch' : 'page') }, uiIcon('pdf')),
          favBtn)));

    // tabs
    const panels = [];
    const overview = [];
    if (rec.body) overview.push(h('section', { class: 'cmw-sub' }, h('h3', null, rec.type || 'Comment'), renderDoc(rec.body)));
    if (!rec.body || (rec.doc && rec.doc.trim())) overview.push(h('section', { class: 'cmw-sub' }, h('h3', null, 'Documentation'), renderDoc(rec.doc)));
    const cimg = customImage(rec);
    if (cimg) overview.push(h('section', { class: 'cmw-sub' }, h('h3', null, 'Image'), imageFigure(cimg, label(rec))));
    const tagged = visibleStereos(rec).filter((s) => s.tags.length);
    for (const s of tagged) { const rows = tagRows(s); if (rows.length) overview.push(h('section', { class: 'cmw-sub' }, h('h3', null, '\u00AB' + s.name + '\u00BB tagged values'), kvTable(rows))); }
    if (rec.rel && rec.ends) overview.push(h('section', { class: 'cmw-sub' }, h('h3', null, 'Ends'), endsTable(rec)));
    if (rec.file) overview.push(h('section', { class: 'cmw-sub' }, h('h3', null, 'Attached file'), fileView(rec.file)));
    const owned = rec.children.map((cid) => model.get(cid)).filter((c) => c && !c.rel);
    if (owned.length) overview.push(h('section', { class: 'cmw-sub' }, h('h3', null, 'Contains'), groupedList(owned)));
    panels.push(['overview', 'Overview', overview]);

    if (rec.isDiagram && rec.shapes.length) {
      const onIt = [...new Set(rec.shapes.filter((s) => !s.rel).map((s) => s.ref))];
      panels.push(['shown', (isTable(rec) ? 'Rows' : 'Shown elements') + ' (' + onIt.length + ')', groupedList(onIt.map((x) => model.get(x) || { id: x, missing: true }))]);
    }
    if (rec.relations.length) panels.push(['rels', 'Relationships (' + rec.relations.length + ')', relationsTable(rec)]);
    let propsPanel = null;
    if (rec.props.length || (cfg.props && !rec.propsLoaded && rec.pchunk)) {
      propsPanel = h('div', { class: 'cmw-props-slot' });
      panels.push(['props', rec.propsLoaded ? 'Properties (' + rec.props.length + ')' : 'Properties', propsPanel]);
    }

    const remembered = storage.get('cmw3:etab', 'overview');
    const activeKey = panels.some((p) => p[0] === remembered) ? remembered : 'overview';
    const tablist = h('div', { class: 'cmw-etabs', role: 'tablist', 'aria-label': 'Element details' });
    const panelEls = [];
    for (const [key, title, body] of panels) {
      const tabId = 'cmw-et-' + key, panelId = 'cmw-ep-' + key;
      const on = key === activeKey;
      const btn = h('button', { role: 'tab', id: tabId, 'aria-controls': panelId, 'aria-selected': String(on), tabindex: on ? '0' : '-1', class: 'cmw-etab', dataset: { key } }, title);
      tablist.append(btn);
      panelEls.push(h('div', { role: 'tabpanel', id: panelId, 'aria-labelledby': tabId, class: 'cmw-panel' + (on ? ' cmw-active' : '') }, h('h2', { class: 'cmw-print-only' }, title), body));
    }
    const fillProps = () => {
      if (!propsPanel || propsPanel.dataset.filled) return;
      propsPanel.dataset.filled = '1';
      if (rec.propsLoaded) { propsPanel.replaceChildren(propsTable(rec.props)); return; }
      propsPanel.replaceChildren(spinnerBlock('Loading properties\u2026'));
      ensureProps(rec).then(() => {
        if (!propsPanel.isConnected) return;
        propsPanel.replaceChildren(rec.props.length ? propsTable(rec.props) : h('p', { class: 'cmw-muted' }, 'No properties.'));
        const t = document.getElementById('cmw-et-props');
        if (t) t.textContent = 'Properties (' + rec.props.length + ')';
      }, (err) => {
        if (propsPanel.isConnected) propsPanel.replaceChildren(h('div', { class: 'cmw-notice cmw-notice-bad' }, 'Properties could not be loaded (' + err.message + '). ', h('a', { href: '#/about' }, 'Details')));
      });
    };
    const selectTab = (key) => {
      if (key === 'props') fillProps();
      storage.set('cmw3:etab', key);
      tablist.querySelectorAll('[role=tab]').forEach((t) => { const on = t.dataset.key === key; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; if (on) t.focus(); });
      panelEls.forEach((p) => p.classList.toggle('cmw-active', p.id === 'cmw-ep-' + key));
    };
    tablist.addEventListener('click', (ev) => { const t = ev.target.closest('[role=tab]'); if (t) selectTab(t.dataset.key); });
    if (activeKey === 'props') fillProps();
    tablist.addEventListener('keydown', (ev) => {
      const tabs = [...tablist.children];
      const i = tabs.indexOf(document.activeElement);
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') { ev.preventDefault(); selectTab(tabs[(i + (ev.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length].dataset.key); }
    });

    // info rail
    const owner = model.get(rec.owner);
    const info = [
      ['Type', rec.type],
      owner ? ['Owner', linkTo(owner.id)] : null,
      rec.isDiagram ? ['Diagram type', rec.dtype] : null,
      ['ID', h('button', { class: 'cmw-idbtn', title: 'Copy ID', onclick: () => copy(rec.id, 'ID copied') }, h('code', null, rec.id), uiIcon('copy'))]
    ].filter(Boolean);
    const dinfo = rec.stereos.find((s) => s.name === 'DiagramInfo');
    if (dinfo) for (const t of dinfo.tags) info.push([t.name, t.value]);
    const rail = h('aside', { class: 'cmw-rail' },
      h('section', { class: 'cmw-card' }, h('h3', null, 'Details'), h('dl', { class: 'cmw-dl' }, info.map(([k, v]) => [h('dt', null, k), h('dd', null, v)]))),
      cfg.appearsIn && (rec.appearsIn.length || !indexed()) ? h('section', { class: 'cmw-card' }, h('h3', null, 'Appears in'),
        rec.appearsIn.length ? h('ul', { class: 'cmw-links' }, rec.appearsIn.map((d) => h('li', null, linkTo(d)))) : null,
        indexed() ? null : h('p', { class: 'cmw-muted cmw-small cmw-indexing-note' }, h('span', { class: 'cmw-spin cmw-spin-sm' }), ' Still indexing diagrams\u2026')) : null);
    if (!indexed() && cfg.appearsIn) {
      const hash = location.hash;
      whenIndexed().then(() => {
        if (location.hash !== hash) return;
        const note = document.querySelector('.cmw-indexing-note');
        if (!note) return;
        const card = note.parentElement;
        card.querySelector('ul')?.remove();
        note.replaceWith(rec.appearsIn.length ? h('ul', { class: 'cmw-links' }, rec.appearsIn.map((d) => h('li', null, linkTo(d)))) : h('p', { class: 'cmw-muted cmw-small' }, 'Not shown on any diagram.'));
      });
    }

    setContent([
      head,
      rec.isDiagram ? h('section', { class: 'cmw-card cmw-pad0 cmw-diagram-card' }, diagramViewer(rec)) : null,
      h('div', { class: 'cmw-split' }, h('div', { class: 'cmw-card cmw-main' }, panels.length > 1 ? tablist : null, panelEls), rail)
    ], label(rec));
  }

  function imageFigure(ci, name) {
    if (!ci.src) return h('p', { class: 'cmw-muted' }, 'The image could not be decoded' + (ci.format ? ' (format: ' + ci.format + ')' : '') + (ci.location ? '. Original file: ' + ci.location : '') + '.');
    return h('figure', { class: 'cmw-cimg' },
      h('a', { href: ci.src, target: '_blank', rel: 'noopener', title: 'Open full size' }, h('img', { src: ci.src, alt: name, onerror: (ev) => ev.target.closest('figure').replaceWith(h('p', { class: 'cmw-muted' }, 'The image data could not be displayed.')) })),
      ci.format || ci.location ? h('figcaption', { class: 'cmw-muted' }, [ci.format ? 'Format: ' + ci.format : null, ci.location ? 'Source: ' + ci.location : null].filter(Boolean).join(' \u00B7 ')) : null);
  }
  function spinnerBlock(text) {
    return h('div', { class: 'cmw-inline-loading', role: 'status' }, h('span', { class: 'cmw-spin' }), text);
  }
  function copy(text, msg) {
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => toast(msg), () => toast(text));
    else toast(text);
  }
  function groupedList(recs) {
    const groups = new Map();
    for (const r of recs) {
      const t = r.missing ? 'Not in this publication' : r.isDiagram ? 'Diagrams' : r.type || 'Elements';
      if (!groups.has(t)) groups.set(t, []);
      groups.get(t).push(r);
    }
    return h('div', { class: 'cmw-groups' }, [...groups.entries()].sort((a, b) => collator.compare(a[0], b[0])).map(([t, list]) =>
      h('div', { class: 'cmw-group' }, h('h4', null, t, h('span', { class: 'cmw-count' }, list.length)),
        h('ul', { class: 'cmw-links' }, list.sort((a, b) => collator.compare(label(a) || a.id, label(b) || b.id)).map((r) => h('li', null, r.missing ? h('span', { class: 'cmw-ext' }, r.id) : linkTo(r.id)))))));
  }
  function kvTable(rows) {
    return h('table', { class: 'cmw-kv' }, h('tbody', null, rows.map(([k, v]) => h('tr', null, h('th', { scope: 'row' }, k), h('td', null, v)))));
  }
  const valueList = (vals) => vals.map((v, i) => [i ? h('span', { class: 'cmw-sep' }, ', ') : null, v.ref ? linkTo(v.ref, v.text) : richValue(v.text)]);
  function propsTable(props) {
    const filterBox = h('input', { type: 'search', class: 'cmw-filter cmw-noprint', placeholder: 'Filter properties', 'aria-label': 'Filter properties' });
    const tbl = kvTable(props.map((p) => [p.name, valueList(p.values)]));
    filterBox.addEventListener('input', () => {
      const t = filterBox.value.toLowerCase();
      for (const tr of tbl.rows) tr.hidden = !!t && !tr.textContent.toLowerCase().includes(t);
    });
    return h('div', { class: 'cmw-props' }, filterBox, tbl);
  }
  function endsTable(rec) {
    const e = rec.ends, rows = [];
    if (e.src.length) rows.push(['Source', valueList(e.src)]);
    if (e.tgt.length) rows.push(['Target', valueList(e.tgt)]);
    if (e.any.length) rows.push(['Related', valueList(e.any)]);
    return rows.length ? kvTable(rows) : h('p', { class: 'cmw-muted' }, 'No ends recorded.');
  }
  function relRows(rec, linkFn) {
    return rec.relations.map((rid) => model.get(rid)).filter(Boolean).map((r) => {
      const e = r.ends;
      let dir = 'undirected', other = [];
      if (e.src.some((x) => x.ref === rec.id)) { dir = 'out'; other = e.tgt; }
      else if (e.tgt.some((x) => x.ref === rec.id)) { dir = 'in'; other = e.src; }
      else other = e.any.filter((x) => x.ref !== rec.id);
      return { r, dir, other };
    }).sort((a, b) => collator.compare(a.r.type, b.r.type));
  }
  function relationsTable(rec) {
    const arrow = { out: '\u2192', in: '\u2190', undirected: '\u2014' };
    return h('table', { class: 'cmw-grid' },
      h('thead', null, h('tr', null, h('th', null, 'Relationship'), h('th', null, 'Direction'), h('th', null, 'Related element'))),
      h('tbody', null, relRows(rec).map(({ r, dir, other }) => h('tr', null,
        h('td', null, h('a', { href: href(r.id), class: 'cmw-ref' }, icon(r), h('span', null, r.type || 'Relationship'))),
        h('td', { class: 'cmw-dir' }, h('span', { class: 'cmw-dirchip cmw-dir-' + dir, title: dir === 'out' ? 'outgoing' : dir === 'in' ? 'incoming' : 'undirected' }, arrow[dir], ' ', dir === 'out' ? 'to' : dir === 'in' ? 'from' : 'with')),
        h('td', null, other.length ? valueList(other) : '\u2014')))));
  }
  function fileView(path) {
    const name = decodeURIComponent(path.split(/[\\/]/).pop());
    const url = /^[a-z]:\\/i.test(path) ? 'file:///' + path.replace(/\\/g, '/') : path.replace(/\\/g, '/');
    const ext = (name.split('.').pop() || '').toLowerCase();
    let preview = null;
    if (/^(png|jpe?g|gif|svg|webp|bmp)$/.test(ext)) preview = h('img', { src: url, alt: name, class: 'cmw-attach-img' });
    else if (/^(mp4|webm|ogv|mov)$/.test(ext)) preview = h('video', { src: url, controls: true, preload: 'metadata', class: 'cmw-attach-media' });
    else if (/^(mp3|wav|ogg|m4a)$/.test(ext)) preview = h('audio', { src: url, controls: true, preload: 'metadata' });
    return [h('p', null, h('a', { href: url, target: '_blank', rel: 'noopener', download: '', class: 'cmw-ref' }, icon('file'), name)), preview];
  }

  // ------------------------------------------------------------------ diagram viewer
  function diagramViewer(rec) {
    const head = h('div', { class: 'cmw-dhead' }, icon(rec), h('span', { class: 'cmw-dname' }, label(rec)), h('span', { class: 'cmw-pill' }, shortType(rec.dtype)));
    if (!rec.img) {
      return h('figure', { class: 'cmw-diagram' }, head, h('div', { class: 'cmw-dempty' }, icon(rec, 'cmw-icon-xl'),
        h('p', null, 'No image was exported for this diagram.'),
        h('p', { class: 'cmw-muted' }, 'Regenerate the report with CATIA Magic Web 3.0.1 or later; earlier builds did not export diagram images.')));
    }
    const img = h('img', { src: rec.img, alt: label(rec), draggable: 'false', class: 'cmw-dimg', decoding: 'async' });
    const layer = h('div', { class: 'cmw-hotspots', role: 'list', 'aria-label': 'Diagram elements' });
    const stage = h('div', { class: 'cmw-stage' }, img, layer);
    const loading = h('div', { class: 'cmw-dloading', role: 'status' }, h('span', { class: 'cmw-spin' }), 'Loading diagram\u2026');
    const viewport = h('div', { class: 'cmw-viewport cmw-is-loading', tabindex: '0', 'aria-busy': 'true', 'aria-label': 'Diagram ' + label(rec) + '. Use + and - to zoom, arrow keys to pan.' }, stage, loading);
    const loaded = () => { loading.remove(); viewport.classList.remove('cmw-is-loading'); viewport.removeAttribute('aria-busy'); };
    const zoomLabel = h('output', { class: 'cmw-zoomval' }, '100%');
    let zoom = 1, natural = { w: 0, h: 0 }, showHot = storage.get('cmw3:hot', false);
    const hotEnabled = cfg.hotspots && !isTable(rec);

    const setZoom = (z, anchor) => {
      const old = zoom;
      zoom = Math.max(0.05, Math.min(z, 8));
      stage.style.width = natural.w * zoom + 'px';
      stage.style.height = natural.h * zoom + 'px';
      zoomLabel.value = Math.round(zoom * 100) + '%';
      if (anchor) {
        const k = zoom / old;
        viewport.scrollLeft = (viewport.scrollLeft + anchor.x) * k - anchor.x;
        viewport.scrollTop = (viewport.scrollTop + anchor.y) * k - anchor.y;
      }
    };
    const fit = () => {
      const w = viewport.clientWidth - 32, hgt = Math.max(viewport.clientHeight - 32, 200);
      if (natural.w && w > 0) setZoom(Math.min(1, w / natural.w, hgt / natural.h));
    };
    const hotBtn = h('button', { class: 'cmw-btn' + (showHot ? ' cmw-on' : ''), title: 'Outline clickable shapes', 'aria-pressed': String(showHot), hidden: !hotEnabled,
      onclick: () => { showHot = !showHot; storage.set('cmw3:hot', showHot); hotBtn.classList.toggle('cmw-on', showHot); hotBtn.setAttribute('aria-pressed', String(showHot)); layer.classList.toggle('cmw-show', showHot); } }, uiIcon('hot'));
    const bar = h('div', { class: 'cmw-dtools', role: 'toolbar', 'aria-label': 'Diagram tools' },
      h('button', { class: 'cmw-btn', title: 'Zoom out (-)', 'aria-label': 'Zoom out', onclick: () => setZoom(zoom / 1.25) }, uiIcon('zoomOut')),
      zoomLabel,
      h('button', { class: 'cmw-btn', title: 'Zoom in (+)', 'aria-label': 'Zoom in', onclick: () => setZoom(zoom * 1.25) }, uiIcon('zoomIn')),
      h('button', { class: 'cmw-btn', title: 'Fit (0)', 'aria-label': 'Fit', onclick: fit }, uiIcon('fit')),
      h('button', { class: 'cmw-btn', title: 'Actual size (1)', 'aria-label': 'Actual size', onclick: () => setZoom(1) }, uiIcon('actual')),
      hotBtn,
      h('a', { class: 'cmw-btn', href: rec.img, target: '_blank', rel: 'noopener', title: 'Open image in new tab', 'aria-label': 'Open image' }, uiIcon('external')));

    img.addEventListener('load', () => {
      loaded();
      natural = { w: img.naturalWidth || rec.imgW || 800, h: img.naturalHeight || rec.imgH || 600 };
      if (hotEnabled) buildHotspots(rec, layer, natural);
      layer.classList.toggle('cmw-show', showHot);
      cfg.fitDiagrams ? fit() : setZoom(1);
      // shrink the viewer when the diagram is smaller than the available space
      viewport.style.height = Math.max(260, Math.min(window.innerHeight * 0.7, 860, natural.h * zoom + 34)) + 'px';
    });
    img.addEventListener('error', () => { loaded(); viewport.replaceChildren(h('div', { class: 'cmw-dempty' }, icon(rec, 'cmw-icon-xl'), h('p', null, 'The diagram image could not be loaded.'), h('code', null, rec.img))); });

    let drag = null;
    viewport.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType === 'touch' || ev.button !== 0 || ev.target.closest('.cmw-hot')) return;
      drag = { x: ev.clientX, y: ev.clientY, l: viewport.scrollLeft, t: viewport.scrollTop };
      viewport.setPointerCapture(ev.pointerId);
      viewport.classList.add('cmw-grabbing');
    });
    viewport.addEventListener('pointermove', (ev) => { if (drag) { viewport.scrollLeft = drag.l - (ev.clientX - drag.x); viewport.scrollTop = drag.t - (ev.clientY - drag.y); } });
    const endDrag = () => { drag = null; viewport.classList.remove('cmw-grabbing'); };
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);
    viewport.addEventListener('wheel', (ev) => {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      const r = viewport.getBoundingClientRect();
      setZoom(zoom * (ev.deltaY < 0 ? 1.15 : 1 / 1.15), { x: ev.clientX - r.left, y: ev.clientY - r.top });
    }, { passive: false });
    viewport.addEventListener('keydown', (ev) => {
      const k = ev.key;
      if (k === '+' || k === '=') setZoom(zoom * 1.25);
      else if (k === '-') setZoom(zoom / 1.25);
      else if (k === '0') fit();
      else if (k === '1') setZoom(1);
      else return;
      ev.preventDefault();
    });
    return h('figure', { class: 'cmw-diagram' }, h('div', { class: 'cmw-dbar' }, head, bar), viewport);
  }

  /**
   * Shape bounds come from the model in diagram coordinates. Line them up with the exported image using
   * the union of ALL presentation elements (frame, notes, paths). Two export layouts are recognised:
   *  - anchored: image spans diagram (0,0) .. content max + margin (seen in Cameo 2026x output)
   *  - cropped:  image spans content bounds + an even margin
   */
  function calibrate(rec, items, W, H) {
    const all = rec.frame && rec.frame.length ? rec.frame.concat(items) : items;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of all) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
    if (!(x1 > x0 && y1 > y0)) return null;
    const rx = W - x1, ry = H - y1;
    if (rx >= 0 && ry >= 0 && Math.abs(rx - ry) <= 3 && x0 >= 0 && y0 >= 0) return { s: 1, ox: 0, oy: 0, mode: 'anchored' };
    const mx = (W - (x1 - x0)) / 2, my = (H - (y1 - y0)) / 2;
    if (mx >= 0 && my >= 0 && Math.abs(mx - my) <= 3) return { s: 1, ox: mx - x0, oy: my - y0, mode: 'cropped' };
    const cw = x1 - x0, ch = y1 - y0;
    if (Math.abs(cw - ch) > 20) {
      const s = (W - H) / (cw - ch), m = (W - s * cw) / 2;
      if (s > 0.1 && s < 10 && m >= -2 && m < Math.min(W, H) / 4) return { s, ox: m - s * x0, oy: m - s * y0, mode: 'scaled' };
    }
    if (x1 <= W && y1 <= H && x0 >= 0 && y0 >= 0) return { s: 1, ox: 0, oy: 0, mode: 'anchored-guess' };
    const m = Math.max(0, Math.min(mx, my));
    return { s: 1, ox: m - x0, oy: m - y0, mode: 'margin-guess' };
  }
  function buildHotspots(rec, layer, natural) {
    layer.textContent = '';
    const items = [];
    for (const s of rec.shapes) if (!s.rel) for (const b of s.boxes) items.push({ ref: s.ref, ...b });
    if (!items.length) return;
    const cal = calibrate(rec, items, natural.w, natural.h);
    if (!cal) return;
    layer.dataset.mode = cal.mode;
    items.sort((a, b) => b.w * b.h - a.w * a.h); // nested (smaller) shapes on top
    for (const it of items) {
      if (it.ref === rec.owner && it.w * it.h > 0.8 * natural.w * natural.h) continue;
      const target = model.get(it.ref);
      const a = h('a', {
        class: 'cmw-hot' + (target ? '' : ' cmw-hot-missing'), role: 'listitem',
        href: target ? href(it.ref) : null, title: target ? label(target) + ' \u2014 ' + target.type : 'Not included in this publication',
        'aria-label': target ? label(target) : 'Element not published', dataset: { ref: it.ref }
      });
      a.style.left = ((cal.ox + cal.s * it.x) / natural.w) * 100 + '%';
      a.style.top = ((cal.oy + cal.s * it.y) / natural.h) * 100 + '%';
      a.style.width = ((cal.s * it.w) / natural.w) * 100 + '%';
      a.style.height = ((cal.s * it.h) / natural.h) * 100 + '%';
      if (cfg.contextMenu && target) a.addEventListener('contextmenu', (ev) => { ev.preventDefault(); showContextMenu(ev, it.ref); });
      layer.append(a);
    }
  }

  // ------------------------------------------------------------------ PDF export (book view + browser "Save as PDF")
  function openPdfDialog(preferred) {
    $('.cmw-dialog')?.remove();
    const cur = currentId && model.get(currentId);
    const scopes = [
      cur ? ['page', 'This page only', label(cur)] : null,
      cur && cur.children.length ? ['branch', 'This element and its contents', label(cur) + ' and everything it contains'] : null,
      ['all', 'Entire model', cfg.title]
    ].filter(Boolean);
    const pick = scopes.find((s) => s[0] === preferred) ? preferred : scopes[0][0];
    const opts = storage.get('cmw3:pdfopts', { d: true, r: true, p: false });
    const radio = (s) => h('label', { class: 'cmw-opt' }, h('input', { type: 'radio', name: 'scope', value: s[0], checked: s[0] === pick }), h('span', null, h('strong', null, s[1]), h('small', null, s[2])));
    const check = (k, t) => h('label', { class: 'cmw-opt cmw-opt-inline' }, h('input', { type: 'checkbox', name: k, checked: !!opts[k] }), t);
    const form = h('form', { method: 'dialog' },
      h('header', { class: 'cmw-dlg-head' }, h('h2', null, 'Export to PDF'), h('button', { class: 'cmw-btn', value: 'cancel', 'aria-label': 'Close' }, uiIcon('close'))),
      h('fieldset', null, h('legend', null, 'What to include'), scopes.map(radio)),
      h('fieldset', null, h('legend', null, 'Content'), check('d', 'Diagrams'), check('r', 'Relationships'), check('p', 'All properties')),
      h('p', { class: 'cmw-muted cmw-small' }, 'A print-ready document opens. In the print dialog choose \u201CSave as PDF\u201D. Turn on \u201CBackground graphics\u201D for colored headings.'),
      h('footer', { class: 'cmw-dlg-foot' }, h('button', { class: 'cmw-btn cmw-btn-ghost', value: 'cancel' }, 'Cancel'), h('button', { class: 'cmw-btn cmw-btn-solid', value: 'ok' }, uiIcon('pdf'), 'Create PDF')));
    const dlg = h('dialog', { class: 'cmw-dialog', 'aria-label': 'Export to PDF' }, form);
    document.body.append(dlg);
    dlg.addEventListener('close', () => {
      const ok = dlg.returnValue === 'ok';
      const fd = new FormData(form);
      dlg.remove();
      if (!ok) return;
      const o = { d: fd.has('d'), r: fd.has('r'), p: fd.has('p') };
      storage.set('cmw3:pdfopts', o);
      const flags = Object.keys(o).filter((k) => o[k]).join('');
      const scope = fd.get('scope');
      if (scope === 'page') { setTimeout(() => window.print(), 50); return; }
      location.hash = '#/book/' + scope + '/' + encodeURIComponent(scope === 'branch' ? currentId : '-') + '/' + flags + 'x';
    });
    dlg.showModal();
  }

  let bookToken = 0;
  async function showBook(scope, startId, flags) {
    const token = ++bookToken;
    const stale = () => token !== bookToken || !/^#\/book\//.test(location.hash);
    const o = { d: flags.includes('d'), r: flags.includes('r'), p: flags.includes('p'), auto: flags.includes('x'), big: flags.includes('k') };
    const start = scope === 'branch' && model.get(startId);
    const rootsList = start ? [start.id] : roots;
    // depth-first walk in containment order; relationships are shown inside their ends, not as sections
    const sections = [];
    const walk = (id, depth, num) => {
      const rec = model.get(id);
      if (!rec || rec.rel) return;
      if (!rec.virtual) sections.push({ rec, depth, num });
      let i = 0;
      for (const cid of rec.children) { const c = model.get(cid); if (c && !c.rel) walk(cid, depth + 1, num + '.' + (++i)); }
    };
    let n = 0;
    for (const id of rootsList) { const r = model.get(id); if (r && !r.rel) walk(id, 0, String(++n)); }
    const figures = { n: 0 };
    const docTitle = start ? label(start) : cfg.title;
    currentId = start ? start.id : null;
    const BIG = 2500;
    if (sections.length > BIG && !o.big) {
      setContent(h('section', { class: 'cmw-card cmw-narrow' },
        h('h1', { class: 'cmw-h1' }, 'Large report'),
        h('p', null, 'This report has ', h('strong', null, sections.length.toLocaleString() + ' sections'), ' (several hundred pages). Building and printing it can take a few minutes.'),
        h('p', { class: 'cmw-muted' }, 'Tip: open a package and use its PDF button to export just that branch.'),
        h('div', { class: 'cmw-dlg-foot' }, h('a', { class: 'cmw-btn cmw-btn-ghost', href: start ? href(start.id) : '#/' }, 'Cancel'),
          h('button', { class: 'cmw-btn cmw-btn-solid', onclick: () => { location.hash = '#/book/' + scope + '/' + encodeURIComponent(startId || '-') + '/' + flags + 'k'; } }, 'Build it anyway'))), 'PDF');
      return;
    }
    const prog = h('div', { class: 'cmw-bar cmw-bar-inline' }, h('div', { class: 'cmw-bar-fill cmw-determinate' }));
    const progText = h('p', { class: 'cmw-muted', role: 'status' }, 'Preparing\u2026');
    const setProg = (t, f) => { progText.textContent = t; prog.firstChild.style.width = Math.round(f * 100) + '%'; };
    setContent(h('section', { class: 'cmw-card cmw-narrow' }, h('h1', { class: 'cmw-h1' }, 'Building PDF \u2014 ', docTitle), prog, progText), 'PDF');
    await maybeYield(true);
    if (!indexed()) {
      const tick = setInterval(() => setProg('Indexing documentation and diagrams \u2014 ' + Math.round((100 * bg.done) / (bg.total || 1)) + '%', 0.3 * (bg.done / (bg.total || 1))), 200);
      await whenIndexed();
      clearInterval(tick);
      if (stale()) return;
    }
    if (o.p) {
      const needed = [...new Set(sections.map((x) => x.rec).filter((r) => !r.propsLoaded && r.pchunk).map((r) => r.pchunk))];
      for (let i = 0; i < needed.length; i++) {
        if (stale()) return;
        setProg('Loading properties \u2014 part ' + (i + 1) + ' of ' + needed.length, 0.3 * (i / needed.length));
        try { await ensureProps(sections.find((x) => x.rec.pchunk === needed[i]).rec); } catch { /* shown as missing */ }
      }
    }

    const cover = h('section', { class: 'cmw-cover' },
      cfg.logo ? h('img', { src: cfg.logo, alt: '', class: 'cmw-cover-logo' }) : null,
      h('p', { class: 'cmw-eyebrow' }, 'Model report'),
      h('h1', null, docTitle),
      start ? h('p', { class: 'cmw-lead' }, start.type + ' in ' + cfg.title) : null,
      h('dl', { class: 'cmw-dl cmw-cover-meta' },
        cfg.projectFile ? [h('dt', null, 'Project'), h('dd', null, cfg.projectFile)] : null,
        cfg.author ? [h('dt', null, 'Author'), h('dd', null, cfg.author)] : null,
        [h('dt', null, 'Published'), h('dd', null, cfg.generated || new Date().toISOString().slice(0, 10))],
        [h('dt', null, 'Contents'), h('dd', null, sections.length + ' elements, ' + sections.filter((s) => s.rec.isDiagram).length + ' diagrams')]),
      h('p', { class: 'cmw-cover-foot' }, 'Generated with CATIA Magic Web ' + VERSION));
    const toc = h('nav', { class: 'cmw-toc' }, h('h2', null, 'Contents'),
      h('ol', null, sections.filter((s) => s.depth < 4).map((s) => h('li', { class: 'cmw-toc-l' + Math.min(s.depth, 3) },
        h('a', { href: '#p-' + cssId(s.rec.id), onclick: (ev) => { ev.preventDefault(); document.getElementById('p-' + cssId(s.rec.id))?.scrollIntoView(); } },
          h('span', { class: 'cmw-toc-num' }, s.num), label(s.rec), s.rec.isDiagram ? h('span', { class: 'cmw-toc-type' }, ' \u00B7 ' + shortType(s.rec.dtype)) : null)))));

    const renderSection = ({ rec, depth, num }) => {
      const hTag = 'h' + Math.min(depth + 2, 5);
      const parts = [
        h(hTag, { class: 'cmw-sec-title' }, h('span', { class: 'cmw-sec-num' }, num), ' ', label(rec)),
        h('p', { class: 'cmw-sec-meta' }, rec.type, visibleStereos(rec).map((s) => ' \u00B7 \u00AB' + s.name + '\u00BB'))
      ];
      if (rec.isDiagram && o.d) {
        figures.n++;
        parts.push(h('figure', { class: 'cmw-fig' },
          rec.img ? h('img', { src: rec.img, alt: label(rec), onerror: (ev) => ev.target.replaceWith(h('p', { class: 'cmw-muted' }, '[Diagram image not available]')) }) : h('p', { class: 'cmw-muted' }, '[No diagram image exported]'),
          h('figcaption', null, 'Figure ' + figures.n + ': ' + label(rec) + ' (' + shortType(rec.dtype) + ')')));
      }
      if (rec.body) parts.push(renderDoc(rec.body));
      if (rec.doc && rec.doc.trim()) parts.push(renderDoc(rec.doc));
      const bookImg = customImage(rec);
      if (bookImg) parts.push(imageFigure(bookImg, label(rec)));
      for (const s of visibleStereos(rec).filter((x) => x.tags.length)) { const rows = tagRows(s); if (rows.length) parts.push(h('p', { class: 'cmw-tbl-cap' }, '\u00AB' + s.name + '\u00BB'), kvTable(rows)); }
      if (rec.file) parts.push(kvTable([['Attached file', rec.file]]));
      if (o.r && rec.relations.length) {
        const arrow = { out: '\u2192', in: '\u2190', undirected: '\u2014' };
        parts.push(h('p', { class: 'cmw-tbl-cap' }, 'Relationships'), kvTable(relRows(rec).map(({ r, dir, other }) => [r.type + ' ' + arrow[dir], other.map((x) => x.text || label(model.get(x.ref))).join(', ') || '\u2014'])));
      }
      if (o.p && rec.props.length) parts.push(h('p', { class: 'cmw-tbl-cap' }, 'Properties'), kvTable(rec.props.map((p) => [p.name, valueList(p.values)])));
      return h('section', { class: 'cmw-sec cmw-depth-' + Math.min(depth, 3) + (rec.isDiagram && o.d ? ' cmw-sec-fig' : ''), id: 'p-' + cssId(rec.id) }, parts);
    };
    const body = [];
    for (let i = 0; i < sections.length; i++) {
      body.push(renderSection(sections[i]));
      if (i % 100 === 99) {
        if (stale()) return;
        setProg('Writing sections \u2014 ' + (i + 1).toLocaleString() + ' of ' + sections.length.toLocaleString(), 0.3 + 0.7 * (i / sections.length));
        await maybeYield(true);
      }
    }
    if (stale()) return;

    const toolbar = h('div', { class: 'cmw-book-bar cmw-noprint' },
      h('a', { class: 'cmw-btn cmw-btn-ghost', href: start ? href(start.id) : '#/' }, uiIcon('back'), 'Back'),
      h('span', { class: 'cmw-book-title' }, 'Print preview \u2014 ', docTitle),
      h('label', { class: 'cmw-opt-inline' }, h('input', { type: 'checkbox', checked: o.d, onchange: () => rebook('d') }), 'Diagrams'),
      h('label', { class: 'cmw-opt-inline' }, h('input', { type: 'checkbox', checked: o.r, onchange: () => rebook('r') }), 'Relationships'),
      h('label', { class: 'cmw-opt-inline' }, h('input', { type: 'checkbox', checked: o.p, onchange: () => rebook('p') }), 'Properties'),
      h('button', { class: 'cmw-btn cmw-btn-solid', onclick: () => window.print() }, uiIcon('print'), 'Print / Save as PDF'));
    function rebook(k) {
      const f = new Set(flags.replace('x', '').split('').filter(Boolean));
      f.has(k) ? f.delete(k) : f.add(k);
      history.replaceState(null, '', '#/book/' + scope + '/' + encodeURIComponent(startId || '-') + '/' + [...f].join(''));
      route();
    }
    document.body.classList.add('cmw-book-mode');
    setContent([toolbar, h('article', { class: 'cmw-book' }, cover, toc, body)], 'PDF \u2013 ' + docTitle);
    if (o.auto) {
      // opened from the dialog: print once all images are ready, then drop the auto flag
      history.replaceState(null, '', location.hash.replace(/x$/, ''));
      const imgs = [...content.querySelectorAll('img')];
      toast('Preparing print\u2026');
      Promise.all(imgs.map((im) => (im.complete ? 0 : new Promise((r) => { im.addEventListener('load', r); im.addEventListener('error', r); })))).then(() => setTimeout(() => { if (!stale()) window.print(); }, 150));
    }
  }
  const cssId = (id) => id.replace(/[^A-Za-z0-9_-]/g, '_');

  // ------------------------------------------------------------------ context menu + toast
  let ctxMenu = null;
  function hideContextMenu() { ctxMenu?.remove(); ctxMenu = null; }
  function showContextMenu(ev, id) {
    hideContextMenu();
    const rec = model.get(id);
    if (!rec) return;
    const item = (text, fn) => h('li', { role: 'none' }, h('button', { role: 'menuitem', onclick: () => { hideContextMenu(); fn(); } }, text));
    ctxMenu = h('ul', { class: 'cmw-ctx', role: 'menu', 'aria-label': label(rec) },
      h('li', { class: 'cmw-ctx-head', role: 'presentation' }, icon(rec), label(rec)),
      item('Open', () => go(id)),
      item('Show in model tree', () => { showTab('containment'); treeView.select(id, true); }),
      item('Copy element ID', () => copy(id, 'ID copied')));
    document.body.append(ctxMenu);
    const r = ctxMenu.getBoundingClientRect();
    ctxMenu.style.left = Math.min(ev.clientX, window.innerWidth - r.width - 8) + 'px';
    ctxMenu.style.top = Math.min(ev.clientY, window.innerHeight - r.height - 8) + 'px';
    ctxMenu.querySelector('button')?.focus();
  }
  document.addEventListener('pointerdown', (ev) => { if (ctxMenu && !ctxMenu.contains(ev.target)) hideContextMenu(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { hideContextMenu(); const m = $('.cmw-theme-menu'); if (m) m.hidden = true; } });

  let toastTimer;
  function toast(msg) {
    let t = $('.cmw-toast');
    if (!t) { t = h('div', { class: 'cmw-toast', role: 'status' }); document.body.append(t); }
    t.textContent = msg;
    t.classList.add('cmw-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('cmw-show'), 1800);
  }

  // Printing any normal page: make sure lazily-loaded images are loaded
  window.addEventListener('beforeprint', () => document.querySelectorAll('img[loading="lazy"]').forEach((i) => (i.loading = 'eager')));

  // ------------------------------------------------------------------ diagnostics (#/about)
  function showAbout() {
    currentId = null;
    const failed = files.filter((f) => f.state === 'failed');
    const byKind = { e: 'Elements (startup)', o: 'Documentation (background)', d: skeletons ? 'Diagram details (background)' : 'Diagrams', p: 'Properties (on demand)' };
    setContent([
      h('header', { class: 'cmw-page-head' }, h('h1', { class: 'cmw-h1' }, 'About this publication')),
      h('div', { class: 'cmw-split' },
        h('div', { class: 'cmw-card cmw-main' },
          h('h3', null, 'Data files'),
          inlineMode && !files.length ? h('p', null, 'All model data is inside the page (DataFiles = false).') : null,
          files.length ? h('table', { class: 'cmw-grid' },
            h('thead', null, h('tr', null, h('th', null, 'File'), h('th', null, 'Content'), h('th', null, 'Items'), h('th', null, 'Status'))),
            h('tbody', null, files.map((f) => h('tr', null,
              h('td', null, h('code', null, f.src)),
              h('td', null, byKind[f.k] || f.k),
              h('td', null, f.c ? f.c.toLocaleString() : ''),
              h('td', null, h('span', { class: 'cmw-dirchip' + (f.state === 'failed' ? ' cmw-bad' : f.state === 'loaded' ? ' cmw-dir-out' : '') },
                f.state === 'loaded' ? 'loaded' + (f.ms != null ? ' · ' + f.ms + ' ms' : '') : f.state === 'failed' ? 'failed: ' + f.error : f.k === 'p' ? 'loads when needed' : f.state === 'pending' ? 'queued' : f.state)))))) : null,
          failed.length ? h('div', { class: 'cmw-notice cmw-notice-bad' }, h('strong', null, failed.length + ' file(s) could not be loaded. '),
            'Make sure the page was copied together with its ', h('code', null, '_files'), ' folder. If the files are missing in the generated output, check the Report Wizard log (Report Wizard wrote: ',
            failed.map((f) => f.res || '(empty)').join(', '), ').') : null),
        h('aside', { class: 'cmw-rail' },
          h('section', { class: 'cmw-card' }, h('h3', null, 'Publication'), h('dl', { class: 'cmw-dl' },
            [['Viewer', 'CATIA Magic Web ' + VERSION], ['Project', cfg.projectFile || '—'], ['Published', cfg.generated || '—'],
              ['Elements', [...model.values()].filter((r) => !r.virtual && !r.isDiagram && !r.rel).length.toLocaleString()],
              ['Relationships', [...model.values()].filter((r) => r.rel).length.toLocaleString()], ['Diagrams', diagrams.length.toLocaleString()],
              ['Data', inlineMode ? 'inline' : files.length + ' files']].map(([k, v]) => [h('dt', null, k), h('dd', null, v)]))),
          h('section', { class: 'cmw-card' }, h('h3', null, 'Load times'), h('dl', { class: 'cmw-dl' },
            loadLog.slice(-12).map(([k, v]) => [h('dt', null, k), h('dd', null, v.toLocaleString() + ' ms')])))))
    ], 'About');
  }

  function showFatal(title, detail) {
    app.className = 'cmw-loading';
    app.removeAttribute('aria-busy');
    const card = app.querySelector('.cmw-load-card') || app;
    card.replaceChildren(...[
      h('div', { class: 'cmw-load-brand' }, cfg.logo ? h('img', { src: cfg.logo, alt: '', width: 40, height: 40 }) : null, h('span', null, h('strong', null, 'CATIA Magic'), ' Web')),
      h('h1', { class: 'cmw-load-title' }, title),
      h('div', { class: 'cmw-notice cmw-notice-bad' }, detail),
      h('ul', { class: 'cmw-hints' },
        h('li', null, 'Keep this page next to its ', h('code', null, '_files'), ' folder when copying or zipping the publication.'),
        h('li', null, 'Open the browser console (F12) for details.'),
        h('li', null, 'If the data files are missing from the generated output, regenerate the report and check the Report Wizard log.')),
      files.length ? h('details', null, h('summary', null, 'Data files'), h('ul', { class: 'cmw-hints' }, files.map((f) => h('li', null, h('code', null, f.src), ' — ', f.state + (f.error ? ' (' + f.error + ')' : ''))))) : null].filter(Boolean));
  }

  // ------------------------------------------------------------------ start
  async function start() {
    try {
      await loadAll();
    } catch (err) {
      console.error(err);
      showFatal('The model could not be read', String(err && err.message || err));
      return;
    }
    const elementFiles = files.filter((f) => f.k === 'e');
    if (!model.size || (elementFiles.length && elementFiles.every((f) => f.state === 'failed'))) {
      showFatal('No model data found', elementFiles.length ? 'None of the ' + elementFiles.length + ' model data files could be loaded.' : 'This page does not contain model data.');
      return;
    }
    loadStatus('Opening…', 1);
    await maybeYield(true);
    buildShell();
    bgStatus();
    window.addEventListener('hashchange', route);
    route();
    setTimeout(() => backgroundLoad(), 300); // documentation + diagram details, after the first page is on screen
    const startupKinds = skeletons ? ['e'] : ['e', 'd'];
    const failed = files.filter((f) => f.state === 'failed' && startupKinds.includes(f.k));
    if (failed.length) banner(failed.length + ' of ' + files.filter((f) => startupKinds.includes(f.k)).length + ' model data files could not be loaded, so part of the model is missing.', '#/about', 'Details');
    whenIndexed().then(() => {
      const late = files.filter((f) => f.state === 'failed' && (f.k === 'o' || (skeletons && f.k === 'd')));
      if (late.length) banner(late.length + ' documentation/diagram data file(s) could not be loaded.', '#/about', 'Details');
    });
  }
  function banner(text, link, linkText) {
    const b = h('div', { class: 'cmw-banner', role: 'alert' }, h('span', null, text), link ? h('a', { href: link }, linkText) : null,
      h('button', { class: 'cmw-btn cmw-sm', 'aria-label': 'Dismiss', onclick: () => b.remove() }, uiIcon('close')));
    content.before(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
