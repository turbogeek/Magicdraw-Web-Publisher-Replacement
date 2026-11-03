// Large synthetic model: node render-big.js <templateDir> <outDir> [elements] [diagrams] [shapesPerDiagram]
const fs = require('fs');
const path = require('path');
const { render } = require('velocityjs');
const { makeContext, writeDiagramSvg } = require('./mock');

const [tplDir, outDir, nEl = '20000', nDia = '80', nShapes = '1500'] = process.argv.slice(2);
const N = +nEl, D = +nDia, S = +nShapes;
const web = path.join(tplDir, 'web');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

let seq = 0;
const els = [];
const mk = (name, humanType, owner, extra = {}) => { const e = { ID: '_big_' + (++seq), name, humanType, owner, stereos: [], doc: '', props: [], ...extra }; els.push(e); return e; };
const root = mk('Big Model', 'Model', null);
const pkgs = [];
for (let p = 0; p < Math.ceil(N / 100); p++) pkgs.push(mk('Package ' + p, 'Package', root, { doc: 'Package number ' + p }));
const blocks = [];
for (let i = 0; els.length < N; i++) {
  const pkg = pkgs[i % pkgs.length];
  const isReq = i % 3 === 0;
  const e = mk((isReq ? 'REQ-' : 'Block ') + i, isReq ? 'Requirement' : 'Block', pkg, {
    doc: '<html><body><p>Element ' + i + ' documentation with <b>formatting</b> and some longer text to make it realistic, describing behavior, constraints and rationale.</p></body></html>',
    stereos: [{ name: isReq ? 'Requirement' : 'Block', ownedAttribute: [{ name: 'Id' }, { name: 'Text' }], tv: { Id: 'ID-' + i, Text: 'Text for ' + i } }]
  });
  // ~35 specification properties, like Cameo's full Specification list
  for (let k = 0; k < 35; k++) e.props.push({ name: 'Property ' + k, value: k % 7 === 0 ? pkg : 'value ' + k });
  if (!isReq) blocks.push(e);
  if (i > 3 && i % 5 === 0) mk('', 'Dependency', pkg, { rel: true, client: e, supplier: els[els.length - 4], rep: 'Dependency[' + e.name + ' -> x]' });
}
const diagrams = [];
for (let d = 0; d < D; d++) {
  const owner = pkgs[d % pkgs.length];
  const cols = Math.ceil(Math.sqrt(S));
  const onDiagram = [];
  for (let s = 0; s < S; s++) onDiagram.push({ e: blocks[(d * 37 + s) % blocks.length], x: 30 + (s % cols) * 170, y: 50 + Math.floor(s / cols) * 90, w: 150, h: 70 });
  const fw = 30 + cols * 170, fh = 50 + Math.ceil(S / cols) * 90;
  const dia = { ID: '_dia_' + d, name: 'Diagram ' + d, humanType: 'Diagram', isDiagram: true, owner, dtype: d % 4 ? 'SysML Block Definition Diagram' : 'SysML Internal Block Diagram', stereos: [], doc: 'Diagram ' + d, props: [], frame: { x: 5, y: 5, w: fw, h: fh }, onDiagram };
  writeDiagramSvg(outDir, dia, 'images/d' + d + '.svg');
  diagrams.push(dia);
}
const t0 = Date.now();
const { ctx } = makeContext({ els, diagrams, outDir, webDir: web, renderFn: render, vars: { projectTitle: 'big model.mdzip [C:\\models\\]', ...JSON.parse(process.env.VARS || '{}') } });
const html = render(fs.readFileSync(path.join(web, 'index.html'), 'utf8'), ctx);
fs.writeFileSync(path.join(outDir, 'index.html'), html);
const size = (p) => { let t = 0; for (const f of fs.readdirSync(p, { withFileTypes: true })) t += f.isDirectory() ? size(path.join(p, f.name)) : fs.statSync(path.join(p, f.name)).size; return t; };
console.log(`elements=${els.length} diagrams=${D} render=${((Date.now() - t0) / 1000).toFixed(1)}s index.html=${(html.length / 1e6).toFixed(1)}MB total=${(size(outDir) / 1e6).toFixed(1)}MB`);
