// Small functional-test model. Usage: node render.js <templateDir> <outDir>
const fs = require('fs');
const path = require('path');
const { render } = require('velocityjs');
const { list, makeContext, writeDiagramSvg } = require('./mock');

const [tplDir, outDir] = process.argv.slice(2);
const web = path.join(tplDir, 'web');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const els = [];
let n = 0;
function el(name, humanType, owner, extra = {}) {
  const e = { ID: '_19_0_' + (++n) + '_abc', name, humanType, owner: owner || null, stereos: [], doc: '', props: [], ...extra };
  els.push(e);
  return e;
}
const model = el('Vehicle Model', 'Model');
const reqs = el('Requirements', 'Package', model);
const struct = el('Structure', 'Package', model);
const req1 = el('Max Speed', 'Requirement', reqs, {
  stereos: [{ name: 'Requirement', ownedAttribute: [{ name: 'base_Class' }, { name: 'Id' }, { name: 'Text' }], tv: { Id: 'REQ-001', Text: 'The vehicle shall reach 200 km/h & stop safely.' } }],
  doc: '<html><body><p>Top speed <b>requirement</b>. See <a href="mdel://ENGINE">Engine</a> and <a href="https://example.com">spec</a>.</p><img src=x onerror="window.__xss=1"><script>window.__xss=2</script></body></html>'
});
el('Weight <limit> "quoted" & \'single\' `tick` ${x}', 'Requirement', reqs, { doc: 'Plain text line 1\nLine 2 with <angle> & ampersand ${notvelocity} #notadirective `backtick` C:\\path\\' });
const vehicle = el('Vehicle', 'Block', struct, { stereos: [{ name: 'Block', ownedAttribute: [{ name: 'base_Class' }, { name: 'isEncapsulated' }], tv: { isEncapsulated: 'false' } }], doc: 'The whole vehicle.' });
const engine = el('Engine', 'Block', struct, { stereos: [{ name: 'Block', ownedAttribute: [], tv: {} }] });
engine.ID = 'ENGINE';
const wheel = el('Wheel', 'Block', struct, { stereos: [{ name: 'Block', ownedAttribute: [], tv: {} }] });
const pEngine = el('engine', 'Part Property', vehicle);
const pWheels = el('wheels', 'Part Property', vehicle);
el('', 'Comment', vehicle, { rep: 'Comment: remember tires' });
el('', 'Satisfy', reqs, { rel: true, client: engine, supplier: req1, rep: 'Satisfy[Engine -> Max Speed]' });
el('', 'Association', struct, { rel: true, related: [vehicle, wheel], rep: 'Association' });
el('spec.txt', 'Attached File', reqs, { attached: 'files/spec.txt' });
for (const e of [pEngine, pWheels]) e.props = [{ name: 'Type', value: e === pEngine ? engine : wheel }, { name: 'Multiplicity', value: e === pEngine ? '1' : '4' }];
vehicle.props = [{ name: 'Name', value: 'Vehicle' }, { name: 'Is Abstract', value: 'false' }, { name: 'Owned Attribute', value: list([pEngine, pWheels]) }, { name: 'Empty', value: '' }];
for (let i = 0; i < 30; i++) el('Req ' + (i + 10), 'Requirement', reqs);
// --- rich content fixtures: CustomImageHolder images, HTML comments/notes, HTML tagged values and properties
const IMG = JSON.parse(fs.readFileSync(path.join(__dirname, 'img-fixtures.json'), 'utf8'));
const holder = (content, format, location) => ({ name: 'CustomImageHolder', ownedAttribute: [{ name: 'content' }, { name: 'format' }, { name: 'location' }], tv: { content, format, location } });
el('Logo PNG', 'Block', struct, { stereos: [{ name: 'Block', ownedAttribute: [], tv: {} }, holder(IMG.png, 'PNG', 'C:\\images\\logo.png')] });
el('Logo SVG', 'Block', struct, { stereos: [holder(IMG.svg, 'SVG', '')] });
el('Photo MIME', 'Block', struct, { stereos: [holder(IMG.jpg, 'MIME: image/jpeg', '')] });
el('', 'Comment', vehicle, { body: '<html><head></head><body><p>Note: <b>tires</b> must be <i>rated</i> for <span style="color:#c00">200 km/h</span>.</p><ul><li>front</li><li>rear</li></ul><script>window.__xss=3</script></body></html>', rep: 'Comment: <html><head></head><body><p>Note: <b>tires</b> must be rated</p></body></html>' });
el('Braking', 'Requirement', reqs, { stereos: [{ name: 'Requirement', ownedAttribute: [{ name: 'Id' }, { name: 'Text' }], tv: { Id: 'REQ-002', Text: '<html><body><p>The vehicle <b>shall</b> stop from 100 km/h within <u>40 m</u>.</p></body></html>' } }],
  props: [{ name: 'Text', value: '<html><body><p>The vehicle <b>shall</b> stop within 40 m.</p></body></html>' }, { name: 'Id', value: 'REQ-002' }] });
// a big package to exercise tree paging (> 300 children)
const bulk = el('Bulk Package', 'Package', model);
for (let i = 0; i < 650; i++) el('Item ' + i, 'Block', bulk);

const shapes = [
  { e: vehicle, x: 320, y: 90, w: 160, h: 90 },
  { e: engine, x: 160, y: 300, w: 160, h: 90 },
  { e: wheel, x: 480, y: 300, w: 160, h: 90 },
  { e: { ID: 'NOT_IN_SCOPE', name: 'Library Block', humanType: 'Block' }, x: 120, y: 90, w: 120, h: 60 }
];
const bdd = { ID: '_19_0_bdd', name: 'Vehicle Structure', humanType: 'Diagram', isDiagram: true, owner: struct, dtype: 'SysML Block Definition Diagram', stereos: [], doc: 'Shows the decomposition.', props: [], frame: { x: 5, y: 5, w: 700, h: 420 }, frameLabel: 'bdd [Package] Structure', onDiagram: shapes };
const ibd = { ID: '_19_0_ibd', name: 'Missing image IBD', humanType: 'Diagram', isDiagram: true, owner: vehicle, dtype: 'SysML Internal Block Diagram', stereos: [], doc: '', props: [], frame: { x: 0, y: 0, w: 10, h: 10 }, onDiagram: [] };
writeDiagramSvg(outDir, bdd, 'images/bdd.svg');
ibd.image = { toString: () => 'images/ibd-missing.png', width: 300, height: 200 };
fs.mkdirSync(path.join(outDir, 'files'), { recursive: true });
fs.writeFileSync(path.join(outDir, 'files', 'spec.txt'), 'attached spec');
// diagrams also appear in the element list in real Cameo output
const all = els.concat([Object.assign({}, bdd, { isDiagram: false, humanType: 'Diagram', props: [] })]);

const { ctx, created } = makeContext({ els: all, diagrams: [bdd, ibd], outDir, webDir: web, renderFn: render, vars: JSON.parse(process.env.VARS || '{}') });
const html = render(fs.readFileSync(path.join(web, 'index.html'), 'utf8'), ctx);
fs.writeFileSync(path.join(outDir, 'index.html'), html);
console.log('rendered', html.length, 'bytes; data files:', created.filter((c) => /data\//.test(c)).length);
