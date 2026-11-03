// Mock Report Wizard context (shared by small and large test renders).
// Mirrors what real Cameo 2026x does: image objects print as a path only when output directly,
// representation text comes back HTML-escaped, exported images are anchored at diagram (0,0) + 25px margin.
const fs = require('fs');
const path = require('path');

// Java's String.replace(CharSequence, CharSequence) replaces ALL occurrences.
const origReplace = String.prototype.replace;
String.prototype.replace = function (a, b) {
  return typeof a === 'string' && typeof b === 'string' ? this.split(a).join(b) : origReplace.call(this, a, b);
};

function list(arr) {
  arr.iterator = () => arr[Symbol.iterator]();
  arr.size = () => arr.length;
  arr.subList = (a, b) => list(arr.slice(a, b));
  return arr;
}

/** Build tools around a model. renderFn(templateText, ctx) renders a Velocity template. */
function makeContext({ els, diagrams, outDir, webDir, renderFn, vars = {} }) {
  const isRel = (e) => !!(e && e.rel);
  const report = {
    isEmpty: (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0),
    isNull: (v) => v == null,
    getRepresentationText: (e) => (e.rep || e.humanType).replace(/&/g, '&amp;').replace(/>/g, '&gt;').replace(/</g, '&lt;'),
    isRelationship: isRel,
    isTypeOf: (e, t) => e.humanType === t,
    getClientElement: (e) => e.client || null,
    getSupplierElement: (e) => e.supplier || null,
    isAttachedFile: (e) => !!e.attached,
    getComment: (e) => e.doc,
    hasStereotype: (e) => e.stereos.length > 0,
    getStereotypes: (e) => list(e.stereos),
    getStereotypePropertyString: (e, st, p) => (st.tv && st.tv[p]) || '',
    getElementProperties: (e) => list(e.props),
    filterVisibleElement: (all) => list(all.filter((e) => !e.isDiagram)),
    findDiagramByName: (nm) => diagrams.find((d) => d.name === nm) || null,
    ensureLoad: () => undefined,
    getDiagramType: (d) => d.dtype,
    getDiagramElements: (d) => list(d.onDiagram.map((s) => s.e)),
    getPresentationDiagramElements: (d) => list([d.frame, ...d.onDiagram].map((b) => ({ bounds: { x: b.x, y: b.y, width: b.w, height: b.h } }))),
    getPresentationElementRectangle: (d, e) => list(d.onDiagram.filter((s) => s.e === e).map((s) => ({ x: s.x.toFixed(1), y: s.y.toFixed(1), width: s.w.toFixed(1), height: s.h.toFixed(1) })))
  };
  for (const e of els) {
    e.relatedElement = list(e.related || []);
    for (const st of e.stereos) st.ownedAttribute = list(st.ownedAttribute || []);
    e.props = list(e.props || []);
  }
  const created = [];
  const file = {
    computeName: (a, b) => a + b,
    copy: (src, dest) => {
      if (typeof src === 'object') { created.push(src.attached); return src.attached; }
      const to = path.join(outDir, dest);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(path.join(webDir, src), to);
      return dest;
    },
    // $file.create(templateFilename, outputFileName, importObject): renders a sub-template with
    // the import map's entries added to a fresh context (plus the standard tools)
    create: (tplName, outName, importObj) => {
      const tpl = fs.readFileSync(path.join(webDir, tplName), 'utf8');
      const sub = { ...base };
      if (importObj && typeof importObj === 'object') for (const [k, v] of importObj.entries ? importObj.entries() : Object.entries(importObj)) sub[k] = v;
      const out = renderFn(tpl, sub);
      const to = path.join(outDir, outName);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, out);
      created.push(outName);
      return to;
    }
  };
  const map = { createHashMap: () => { const m = new Map(); m.put = (k, v) => { m.set(k, v); return null; }; return m; } };
  const base = {
    report, file, map,
    template: { resourcesLocation: '' },
    project: { title: vars.projectTitle || 'Vehicle <Demo> Project', getElementByID: (id) => els.find((e) => e.ID === id) },
    date: { get: () => '2026-11-03 13:45' },
    image: { copy: (p) => p }
  };
  const ctx = {
    ...base,
    elements: list(els.filter((e) => !e.isDiagram)),
    Diagram: list(diagrams),
    Title: 'Vehicle Model Web Publication', Author: 'Daniel <QA> & Co',
    HomeImage: '', UseContextMenu: 'true', ExportLinkedFile: 'true', ShowAppearsInPage: 'true', DisplayTreeElementId: 'false',
    ShowAppliedStereotypes: 'true', SVGDiagramResizable: 'true', DiagramHotspots: 'true', IncludeAllProperties: 'true',
    ...vars
  };
  return { ctx, created };
}

/** Writes an SVG image for a mock diagram (anchored at 0,0 with a 25px margin, like Cameo). */
function writeDiagramSvg(outDir, d, rel) {
  const W = d.frame.x + d.frame.w + 25, H = d.frame.y + d.frame.h + 25;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial" font-size="12">`,
    `<rect width="${W}" height="${H}" fill="#fff"/><rect x="${d.frame.x}" y="${d.frame.y}" width="${d.frame.w}" height="${d.frame.h}" fill="none" stroke="#333"/>`,
    `<text x="${d.frame.x + 8}" y="${d.frame.y + 18}">${d.frameLabel || d.name}</text>`];
  for (const s of d.onDiagram) {
    parts.push(`<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="#fffbe6" stroke="#333"/><text x="${s.x + 6}" y="${s.y + 16}">«block» ${String(s.e.name).replace(/[<&>]/g, '')}</text>`);
  }
  parts.push('</svg>');
  const to = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, parts.join('\n'));
  d.image = { toString: () => rel, width: W, height: H };
  return { W, H };
}

module.exports = { list, makeContext, writeDiagramSvg };
