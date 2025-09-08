// Standalone sandbox that reuses the app's SVG importer logic
import { extractMergedNodesWithTransforms } from '../utils/svgToNodes.js';

const $ = (id) => document.getElementById(id);
const canvas = $('c');
const ctx = canvas.getContext('2d');

const state = {
  layers: [], // { name, nodes, subpaths?, position:{x,y,scale}, viewBoxMapped:true }
  raw: [],    // baseline before fitting
  adjust: { dx: 0, dy: 0, s: 1 },
  fit: true,
  debug: false,
  forceRef: false,
  ref: { minX: 0, minY: 0, width: 1500, height: 1513 },
};

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.floor(window.innerWidth));
  const h = Math.max(1, Math.floor(window.innerHeight));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

window.addEventListener('resize', () => { resize(); draw(); });
resize();

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const width = canvas.clientWidth; // backed by setTransform(dpr)
  const height = canvas.clientHeight;

  // render layers
  for (const layer of state.layers) {
    if (!layer || !layer.position) continue;
    const { x, y, scale } = layer.position;
    const centerX = x * width;
    const centerY = y * height;
    const radiusX = (width / 2) * scale;
    const radiusY = (height / 2) * scale;

    const drawPath = (nodes) => {
      if (!Array.isArray(nodes) || nodes.length < 3) return;
      ctx.beginPath();
      const last = nodes[nodes.length - 1];
      ctx.moveTo(centerX + last.x * radiusX, centerY + last.y * radiusY);
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const px = centerX + n.x * radiusX;
        const py = centerY + n.y * radiusY;
        const next = nodes[(i + 1) % nodes.length];
        const midX = centerX + (n.x + next.x) * 0.5 * radiusX;
        const midY = centerY + (n.y + next.y) * 0.5 * radiusY;
        ctx.quadraticCurveTo(px, py, midX, midY);
      }
      ctx.closePath();
      ctx.fillStyle = '#29a3ff30';
      ctx.strokeStyle = '#29a3ff';
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    };

    if (Array.isArray(layer.subpaths) && layer.subpaths.length) {
      for (const sp of layer.subpaths) drawPath(sp);
    } else {
      drawPath(layer.nodes);
    }
  }

  if (state.debug) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      const x = (i / 10) * width;
      const y = (i / 10) * height;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
    for (const l of state.layers) {
      const cx = (l?.position?.x || 0.5) * width;
      const cy = (l?.position?.y || 0.5) * height;
      ctx.beginPath(); ctx.moveTo(cx - 6, cy); ctx.lineTo(cx + 6, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - 6); ctx.lineTo(cx, cy + 6); ctx.stroke();
    }
    ctx.restore();
  }
}

function recomputeLayout() {
  if (!state.raw.length) { draw(); return; }
  // start from raw
  state.layers.forEach((l, i) => {
    const b = state.raw[i] || { x: 0.5, y: 0.5, s: 1 };
    l.position = { x: b.x, y: b.y, scale: b.s };
  });

  if (state.fit && state.layers.length > 1) {
    const margin = 0.02;
    const meta = state.layers.map(l => {
      const s = Number(l.position?.scale) || 1;
      let maxAbsX = 0, maxAbsY = 0;
      const nodes = Array.isArray(l.nodes) ? l.nodes : [];
      nodes.forEach(n => { const ax = Math.abs(n.x)||0, ay = Math.abs(n.y)||0; if(ax>maxAbsX)maxAbsX=ax; if(ay>maxAbsY)maxAbsY=ay; });
      const px = Number(l.position?.x) || 0.5;
      const py = Number(l.position?.y) || 0.5;
      return { px, py, s, maxAbsX, maxAbsY };
    });
    const bounds = meta.reduce((a,m)=>{
      const hw=(m.maxAbsX||1)*0.5*m.s, hh=(m.maxAbsY||1)*0.5*m.s;
      const minX=m.px-hw, maxX=m.px+hw, minY=m.py-hh, maxY=m.py+hh;
      if(minX<a.minX)a.minX=minX; if(maxX>a.maxX)a.maxX=maxX; if(minY<a.minY)a.minY=minY; if(maxY>a.maxY)a.maxY=maxY; return a;
    },{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});
    const widthFrac = Math.max(0.0001, bounds.maxX - bounds.minX);
    const heightFrac = Math.max(0.0001, bounds.maxY - bounds.minY);
    const fitX = (1 - 2*margin) / widthFrac;
    const fitY = (1 - 2*margin) / heightFrac;
    const sFit = Math.min(1, fitX, fitY);
    if (sFit < 1) state.layers.forEach(l => l.position.scale = (Number(l.position.scale)||1) * sFit);
    // recenter
    const bounds2 = meta.reduce((a,m)=>{
      const s2 = m.s * (sFit < 1 ? sFit : 1);
      const hw=(m.maxAbsX||1)*0.5*s2, hh=(m.maxAbsY||1)*0.5*s2;
      const minX=m.px-hw, maxX=m.px+hw, minY=m.py-hh, maxY=m.py+hh;
      if(minX<a.minX)a.minX=minX; if(maxX>a.maxX)a.maxX=maxX; if(minY<a.minY)a.minY=minY; if(maxY>a.maxY)a.maxY=maxY; return a;
    },{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});
    const cx=(bounds2.minX+bounds2.maxX)/2, cy=(bounds2.minY+bounds2.maxY)/2;
    const dx=0.5-cx, dy=0.5-cy;
    state.layers.forEach(l=>{ l.position.x=Math.min(1,Math.max(0,(Number(l.position.x)||0.5)+dx)); l.position.y=Math.min(1,Math.max(0,(Number(l.position.y)||0.5)+dy)); });
  }

  // offsets
  const clampMin = -0.2, clampMax = 1.2;
  state.layers.forEach(l=>{
    l.position.x=Math.min(clampMax,Math.max(clampMin,(Number(l.position.x)||0.5)+state.adjust.dx));
    l.position.y=Math.min(clampMax,Math.max(clampMin,(Number(l.position.y)||0.5)+state.adjust.dy));
    l.position.scale=Math.min(5,Math.max(0.05,(Number(l.position.scale)||1)*state.adjust.s));
  });

  draw();
}

async function importFiles(files) {
  const layers = [];
  const refs = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const text = await file.text();
    const opt = state.forceRef ? { forcedRef: { ...state.ref }, ignoreSvgViewBox: true } : {};
    const merged = extractMergedNodesWithTransforms(text, 0, opt);
    if (merged && Array.isArray(merged.nodes) && merged.nodes.length > 2) {
      const { nodes, subpaths, center, ref } = merged;
      const refMinX = Number(ref?.minX) || 0;
      const refMinY = Number(ref?.minY) || 0;
      const refW = Number(ref?.width) || 1;
      const refH = Number(ref?.height) || 1;
      const pos = { x: (center.x - refMinX) / refW, y: (center.y - refMinY) / refH };
      layers.push({
        name: file.name.replace(/\.[^/.]+$/, ''),
        layerType: 'shape',
        nodes,
        subpaths: Array.isArray(subpaths) && subpaths.length ? subpaths : undefined,
        viewBoxMapped: true,
        position: { x: pos.x, y: pos.y, scale: 1 },
        visible: true,
      });
      refs.push(ref || null);
    }
  }
  state.layers = layers;
  state.raw = layers.map(l => ({ x: l.position.x, y: l.position.y, s: l.position.scale }));
  state.adjust = { dx: 0, dy: 0, s: 1 };
  $('dx').value = 0; $('dxv').textContent = '0.00';
  $('dy').value = 0; $('dyv').textContent = '0.00';
  $('s').value = 1; $('sv').textContent = '1.00x';

  // viewBox mismatch warning
  const sig = (r) => r && Number.isFinite(r.width) && Number.isFinite(r.height) ? `${r.minX},${r.minY},${r.width},${r.height}` : 'none';
  const uniq = Array.from(new Set(refs.map(sig)));
  if (layers.length > 1 && uniq.length > 1) {
    console.warn('SVG import: files have different viewBox/size. Relative positions may be incorrect. Unique refs:', uniq);
  }

  recomputeLayout();
}

// UI wiring
$('files').addEventListener('change', (e) => importFiles(Array.from(e.target.files || [])));
$('clear').addEventListener('click', () => { state.layers = []; state.raw = []; draw(); });
$('fit').addEventListener('change', (e) => { state.fit = !!e.target.checked; recomputeLayout(); });
$('debug').addEventListener('change', (e) => { state.debug = !!e.target.checked; draw(); });
$('forceRef').addEventListener('change', (e) => { state.forceRef = !!e.target.checked; });
$('refW').addEventListener('input', (e) => { state.ref.width = parseFloat(e.target.value)||1500; });
$('refH').addEventListener('input', (e) => { state.ref.height = parseFloat(e.target.value)||1513; });
$('dx').addEventListener('input', (e) => { state.adjust.dx = parseFloat(e.target.value); $('dxv').textContent = state.adjust.dx.toFixed(2); recomputeLayout(); });
$('dy').addEventListener('input', (e) => { state.adjust.dy = parseFloat(e.target.value); $('dyv').textContent = state.adjust.dy.toFixed(2); recomputeLayout(); });
$('s').addEventListener('input', (e) => { state.adjust.s = parseFloat(e.target.value); $('sv').textContent = state.adjust.s.toFixed(2)+'x'; recomputeLayout(); });
$('reset').addEventListener('click', () => { state.adjust = { dx: 0, dy: 0, s: 1 }; $('dx').value=0; $('dxv').textContent='0.00'; $('dy').value=0; $('dyv').textContent='0.00'; $('s').value=1; $('sv').textContent='1.00x'; recomputeLayout(); });
$('exportJSON').addEventListener('click', () => {
  const payload = state.layers.map(l => ({ name: l.name, x: l.position.x, y: l.position.y, scale: l.position.scale }));
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'import-layout.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
});

// initial draw
draw();
