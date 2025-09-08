// Utilities to convert SVG path data into normalized nodes compatible with Canvas.jsx node editing
// Each node is { x, y } in a layer-local coordinate space where the shape is centered at (0,0)
// and typically spans roughly [-1,1] in both axes before being scaled by layer.width/height.

// Sample an SVG path string using the browser's SVGPathElement API
export function samplePath(d, sampleCount = 0) {
  if (!d || typeof d !== 'string') return [];
  // Create an off-DOM SVG path to measure and sample
  const svgNS = 'http://www.w3.org/2000/svg';
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('d', d);

  const total = path.getTotalLength?.() || 0;
  if (!isFinite(total) || total <= 0) return [];

  // Adaptive sampling if caller doesn't specify: ~1 point per 2 units of path length, clamped
  const adaptive = Math.max(64, Math.min(2048, Math.floor(total / 2)));
  const desired = (typeof sampleCount === 'number' && sampleCount > 0) ? sampleCount : adaptive;
  const count = Math.max(3, Math.floor(desired));
  const points = [];
  for (let i = 0; i < count; i++) {
    const p = path.getPointAtLength((i / count) * total);
    points.push({ x: p.x, y: p.y });
  }
  return points;
}

// Normalize using an explicit box {minX, minY, width, height}
export function normalizePointsWithBox(points, box) {
  if (!Array.isArray(points) || points.length < 3) return [];
  const minX = Number(box.minX) || 0;
  const minY = Number(box.minY) || 0;
  const w = Number(box.width) || 1;
  const h = Number(box.height) || 1;
  const cx = minX + w / 2;
  const cy = minY + h / 2;
  // Non-uniform scale by half extents to preserve exact positions in viewBox
  const sx = (w / 2) || 1;
  const sy = (h / 2) || 1;
  return points.map(p => ({ x: (p.x - cx) / sx, y: (p.y - cy) / sy }));
}

// Normalize absolute points into nodes centered at (0,0) with half-extents hx, hy
export function normalizePoints(points) {
  if (!Array.isArray(points) || points.length < 3) return [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  let hx = (maxX - minX) / 2;
  let hy = (maxY - minY) / 2;
  // Use uniform scale to preserve original aspect ratio; fit into unit square keeping proportions
  let s = Math.max(hx, hy);
  if (!isFinite(s) || s <= 1e-6) s = 1;
  return points.map(p => ({ x: (p.x - cx) / s, y: (p.y - cy) / s }));
}

// Public API: Convert a path string into normalized nodes
export function svgPathToNodes(d, sampleCount = 0) {
  const pts = samplePath(d, sampleCount);
  return normalizePoints(pts);
}

// Public API: Extract first <path d="..."> from an SVG string and convert
export function svgStringToNodes(svgString, sampleCount = 0) {
  if (!svgString || typeof svgString !== 'string') return [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    const pathEl = doc.querySelector('path');
    const d = pathEl?.getAttribute('d') || '';
    if (!d) return [];
    // Sample raw points first
    const pts = samplePath(d, sampleCount);
    // If SVG has a viewBox, normalize all shapes to that common frame
    const vb = svgEl?.getAttribute('viewBox')?.split(/\s+|,/) || null;
    if (vb && vb.length >= 4) {
      const box = { minX: parseFloat(vb[0]), minY: parseFloat(vb[1]), width: parseFloat(vb[2]), height: parseFloat(vb[3]) };
      if (Number.isFinite(box.width) && Number.isFinite(box.height) && box.width > 0 && box.height > 0) {
        return normalizePointsWithBox(pts, box);
      }
    }
    // Fallback: per-path bbox normalization
    return normalizePoints(pts);
  } catch (e) {
    console.warn('svgStringToNodes: failed to parse SVG string', e);
    return [];
  }
}

// Helper to handle multiple paths by concatenating samples, if needed
export function multiPathToNodes(ds, samplePerPath = 0) {
  if (!Array.isArray(ds) || ds.length === 0) return [];
  const allPoints = [];
  for (const d of ds) {
    const pts = samplePath(d, samplePerPath);
    allPoints.push(...pts);
  }
  return normalizePoints(allPoints);
}

// Extract all <path> elements from an SVG string, apply cumulative transforms, and
// return an array of { nodes, center, bbox, ref } where nodes are normalized using
// the SVG's viewBox (if present) to ensure consistent scaling across files.
export function extractAllPathsWithTransforms(svgString, sampleCount = 0) {
  if (!svgString || typeof svgString !== 'string') return [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return [];

    let ref = null;
    const vb = svgEl.getAttribute('viewBox')?.split(/\s+|,/) || null;
    if (vb && vb.length >= 4) {
      ref = { minX: parseFloat(vb[0]), minY: parseFloat(vb[1]), width: parseFloat(vb[2]), height: parseFloat(vb[3]) };
    } else {
      // Fallback to width/height if available when viewBox is missing
      const wAttr = svgEl.getAttribute('width');
      const hAttr = svgEl.getAttribute('height');
      const w = parseFloat(wAttr || '0');
      const h = parseFloat(hAttr || '0');
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
        ref = { minX: 0, minY: 0, width: w, height: h };
      }
    }

    // Create a live SVG to compute CTMs including parent group transforms
    const liveSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    if (ref && Number.isFinite(ref.width) && Number.isFinite(ref.height)) {
      liveSvg.setAttribute('viewBox', `${ref.minX} ${ref.minY} ${ref.width} ${ref.height}`);
    }
    liveSvg.style.position = 'absolute';
    liveSvg.style.left = '-10000px';
    liveSvg.style.top = '-10000px';
    // Recreate full group hierarchy so getCTM includes ancestor transforms
    liveSvg.innerHTML = svgEl.innerHTML;
    document.body.appendChild(liveSvg);

    const livePaths = Array.from(liveSvg.querySelectorAll('path'));
    const results = [];

    for (const el of livePaths) {
      // Determine sampling count
      const totalLen = el.getTotalLength?.() || 0;
      if (!(totalLen > 0)) continue;
      const adaptive = Math.max(64, Math.min(4096, Math.floor(totalLen / 2)));
      const count = Math.max(3, Math.floor(sampleCount > 0 ? sampleCount : adaptive));

      // Sample points in path-local space
      const rawPts = [];
      for (let i = 0; i < count; i++) {
        const p = el.getPointAtLength((i / count) * totalLen);
        rawPts.push({ x: p.x, y: p.y });
      }

      // Apply CTM (includes ancestor transforms)
      let m = null;
      try { m = el.getCTM && el.getCTM(); } catch {}
      const pts = rawPts.map(pt => {
        if (m && typeof m.a === 'number') {
          const x = pt.x * m.a + pt.y * m.c + m.e;
          const y = pt.x * m.b + pt.y * m.d + m.f;
          return { x, y };
        }
        return pt;
      });

      // Compute bbox/center in SVG coords
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of pts) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y; }
      const bbox = { minX, minY, width: maxX - minX, height: maxY - minY };
      const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };

      // Normalize nodes using viewBox if available for cross-file consistency
      const nodes = ref ? normalizePointsWithBox(pts, ref) : normalizePoints(pts);
      results.push({ nodes, center, bbox, ref });
    }

    document.body.removeChild(liveSvg);
    return results;
  } catch (e) {
    console.warn('extractAllPathsWithTransforms: failed', e);
    return [];
  }
}

// Extract and merge all path points (with transforms) into a single nodes array
// normalized by the SVG's viewBox (if present). This is ideal when importing
// a multi-path SVG as a single shape/layer.
export function extractMergedNodesWithTransforms(svgString, sampleCount = 0, options = {}) {
  if (!svgString || typeof svgString !== 'string') return [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return [];

    let ref = null;
    const vb = svgEl.getAttribute('viewBox')?.split(/\s+|,/) || null;
    if (!options.ignoreSvgViewBox && vb && vb.length >= 4) {
      ref = { minX: parseFloat(vb[0]), minY: parseFloat(vb[1]), width: parseFloat(vb[2]), height: parseFloat(vb[3]) };
    } else {
      const wAttr = svgEl.getAttribute('width');
      const hAttr = svgEl.getAttribute('height');
      const w = parseFloat(wAttr || '0');
      const h = parseFloat(hAttr || '0');
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
        ref = { minX: 0, minY: 0, width: w, height: h };
      }
    }
    if (options && options.forcedRef && Number.isFinite(options.forcedRef.width) && Number.isFinite(options.forcedRef.height)) {
      const fr = options.forcedRef;
      ref = { minX: Number(fr.minX) || 0, minY: Number(fr.minY) || 0, width: Number(fr.width), height: Number(fr.height) };
    }

    // Create a live SVG to compute CTMs including parent group transforms
    const liveSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    if (ref && Number.isFinite(ref.width) && Number.isFinite(ref.height)) {
      liveSvg.setAttribute('viewBox', `${ref.minX} ${ref.minY} ${ref.width} ${ref.height}`);
    }
    liveSvg.style.position = 'absolute';
    liveSvg.style.left = '-10000px';
    liveSvg.style.top = '-10000px';
    // Recreate full group hierarchy so getCTM includes ancestor transforms
    liveSvg.innerHTML = svgEl.innerHTML;
    document.body.appendChild(liveSvg);

    const select = 'path,polygon,polyline,rect,circle,ellipse';
    const liveEls = Array.from(liveSvg.querySelectorAll(select));
    const allPts = [];
    const subpaths = [];

    const pushTransformed = (el, pts) => {
      if (!pts || pts.length === 0) return;
      let m = null;
      try { m = el.getCTM && el.getCTM(); } catch {}
      const transformed = [];
      if (m && typeof m.a === 'number') {
        for (let i = 0; i < pts.length; i++) {
          const px = pts[i].x;
          const py = pts[i].y;
          const x = px * m.a + py * m.c + m.e;
          const y = px * m.b + py * m.d + m.f;
          transformed.push({ x, y });
        }
      } else {
        transformed.push(...pts);
      }
      subpaths.push(transformed);
      allPts.push(...transformed);
    };

    for (const el of liveEls) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'path') {
        const totalLen = el.getTotalLength?.() || 0;
        if (!(totalLen > 0)) continue;
        const adaptive = Math.max(64, Math.min(4096, Math.floor(totalLen / 2)));
        const count = Math.max(3, Math.floor(sampleCount > 0 ? sampleCount : adaptive));
        const pts = [];
        for (let i = 0; i < count; i++) {
          const p = el.getPointAtLength((i / count) * totalLen);
          pts.push({ x: p.x, y: p.y });
        }
        pushTransformed(el, pts);
      } else if (tag === 'polygon' || tag === 'polyline') {
        const raw = el.getAttribute('points') || '';
        const nums = raw.trim().split(/[\s,]+/).map(parseFloat).filter(n => Number.isFinite(n));
        const pts = [];
        for (let i = 0; i + 1 < nums.length; i += 2) {
          pts.push({ x: nums[i], y: nums[i + 1] });
        }
        pushTransformed(el, pts);
      } else if (tag === 'rect') {
        const x = parseFloat(el.getAttribute('x') || '0');
        const y = parseFloat(el.getAttribute('y') || '0');
        const w = parseFloat(el.getAttribute('width') || '0');
        const h = parseFloat(el.getAttribute('height') || '0');
        const rx = parseFloat(el.getAttribute('rx') || '0');
        const ry = parseFloat(el.getAttribute('ry') || '0');
        if (w <= 0 || h <= 0) continue;
        const outline = [];
        const segments = Math.max(16, Math.min(128, sampleCount > 0 ? sampleCount : 64));
        if (rx > 0 || ry > 0) {
          const crx = Math.max(0, rx);
          const cry = Math.max(0, ry || rx);
          // Approximate rounded rect by sampling per corner arcs and straight edges
          const corners = [
            { cx: x + crx, cy: y + cry, sx: x, sy: y + cry, ex: x + crx, ey: y }, // top-left arc end points
            { cx: x + w - crx, cy: y + cry, sx: x + w - crx, sy: y, ex: x + w, ey: y + cry }, // top-right
            { cx: x + w - crx, cy: y + h - cry, sx: x + w, sy: y + h - cry, ex: x + w - crx, ey: y + h }, // bottom-right
            { cx: x + crx, cy: y + h - cry, sx: x + crx, sy: y + h, ex: x, ey: y + h - cry }, // bottom-left
          ];
          const arcSteps = Math.max(4, Math.floor(segments / 8));
          // Straight edges between arcs
          outline.push({ x: x + crx, y });
          outline.push({ x: x + w - crx, y });
          outline.push({ x: x + w, y: y + cry });
          outline.push({ x: x + w, y: y + h - cry });
          outline.push({ x: x + w - crx, y: y + h });
          outline.push({ x: x + crx, y: y + h });
          outline.push({ x, y: y + h - cry });
          outline.push({ x, y: y + cry });
          // Corner arcs (coarsely approximate with circle segments)
          const arc = (cx, cy, r, a0, a1, n) => {
            const pts = [];
            for (let i = 0; i <= n; i++) {
              const t = a0 + (i / n) * (a1 - a0);
              pts.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
            }
            return pts;
          };
          // Replace rough corners with arcs
          const tl = arc(x + crx, y + cry, Math.min(crx, cry), Math.PI, Math.PI * 1.5, arcSteps);
          const tr = arc(x + w - crx, y + cry, Math.min(crx, cry), Math.PI * 1.5, Math.PI * 2, arcSteps);
          const br = arc(x + w - crx, y + h - cry, Math.min(crx, cry), 0, Math.PI * 0.5, arcSteps);
          const bl = arc(x + crx, y + h - cry, Math.min(crx, cry), Math.PI * 0.5, Math.PI, arcSteps);
          const pts = [...tl, ...tr, ...br, ...bl];
          pushTransformed(el, pts);
        } else {
          const pts = [
            { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }
          ];
          pushTransformed(el, pts);
        }
      } else if (tag === 'circle' || tag === 'ellipse') {
        const cx = parseFloat(el.getAttribute('cx') || '0');
        const cy = parseFloat(el.getAttribute('cy') || '0');
        const rx = tag === 'circle' ? parseFloat(el.getAttribute('r') || '0') : parseFloat(el.getAttribute('rx') || '0');
        const ry = tag === 'circle' ? parseFloat(el.getAttribute('r') || '0') : parseFloat(el.getAttribute('ry') || '0');
        if (!(rx > 0 && ry > 0)) continue;
        const steps = Math.max(32, Math.min(512, sampleCount > 0 ? sampleCount : 128));
        const pts = [];
        for (let i = 0; i < steps; i++) {
          const t = (i / steps) * Math.PI * 2;
          pts.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
        }
        pushTransformed(el, pts);
      }
    }

    document.body.removeChild(liveSvg);

    if (allPts.length < 3) return [];
    // Compute center in SVG coordinates for positioning
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of allPts) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y; }
    const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    // Normalize merged absolute points with the viewBox for consistency
    const nodes = ref ? normalizePointsWithBox(allPts, ref) : normalizePoints(allPts);
    const subpathNodes = subpaths.map(pts => ref ? normalizePointsWithBox(pts, ref) : normalizePoints(pts));
    return { nodes, subpaths: subpathNodes, center, ref };
  } catch (e) {
    console.warn('extractMergedNodesWithTransforms: failed', e);
    return [];
  }
}
