export const computeInitialNodes = (source) => {
  const raw = typeof source === 'number' ? source : Number(source?.numSides);
  const n = Math.max(3, Math.round(Number.isFinite(raw) ? raw : 3));
  const nodes = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    nodes.push({ x: Math.cos(angle), y: Math.sin(angle) });
  }
  return nodes;
};

export const resizeNodes = (nodes, desired, options = {}) => {
  const closed = options?.closed !== false;
  const minimum = closed ? 3 : 2;
  const target = Math.max(minimum, Math.round(Number(desired) || 0));
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return closed
      ? computeInitialNodes(target)
      : Array.from({ length: target }, (_, index) => ({
        x: target === 1 ? 0 : -1 + (index / (target - 1)) * 2,
        y: 0,
      }));
  }
  const cloneNode = (node) => ({
    ...(node && typeof node === 'object' ? node : {}),
    x: Number.isFinite(node?.x) ? Number(node.x) : 0,
    y: Number.isFinite(node?.y) ? Number(node.y) : 0,
  });
  const distance = (a, b) => Math.hypot((b?.x || 0) - (a?.x || 0), (b?.y || 0) - (a?.y || 0));
  const EPSILON = 1e-9;
  let curr = nodes.map(cloneNode);
  if (curr.length < minimum) {
    if (closed) return computeInitialNodes(target);
    const start = curr[0] || { x: -1, y: 0 };
    return Array.from({ length: target }, (_, index) => ({
      ...start,
      x: start.x + (target === 1 ? 0 : index / (target - 1)),
    }));
  }
  if (curr.length === target) return curr;
  // Expand by repeatedly splitting the longest edge so new points spread around the shape
  while (curr.length < target) {
    let longestIndex = -1;
    let longestLength = -Infinity;
    const segmentCount = closed ? curr.length : curr.length - 1;
    for (let i = 0; i < segmentCount; i++) {
      const nextIndex = closed ? (i + 1) % curr.length : i + 1;
      const len = distance(curr[i], curr[nextIndex]);
      if (len > longestLength) {
        longestLength = len;
        longestIndex = i;
      }
    }
    if (!(longestLength > EPSILON) || longestIndex < 0) {
      return computeInitialNodes(target);
    }
    const insertIndex = longestIndex + 1;
    const a = curr[longestIndex];
    const b = curr[insertIndex];
    const midpoint = {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    };
    curr.splice(insertIndex, 0, midpoint);
  }
  // Reduce by removing the point whose removal least distorts the surrounding edges
  while (curr.length > target) {
    let removalIndex = -1;
    let minPenalty = Infinity;
    const firstRemovable = closed ? 0 : 1;
    const lastRemovable = closed ? curr.length - 1 : curr.length - 2;
    for (let i = firstRemovable; i <= lastRemovable; i++) {
      const prev = curr[(i - 1 + curr.length) % curr.length];
      const next = curr[(i + 1) % curr.length];
      const penalty = distance(prev, curr[i]) + distance(curr[i], next) - distance(prev, next);
      if (penalty < minPenalty) {
        minPenalty = penalty;
        removalIndex = i;
      }
    }
    if (removalIndex < 0) {
      curr.pop();
    } else {
      curr.splice(removalIndex, 1);
    }
  }
  return curr;
};

/**
 * Linearly interpolate between two node arrays of the same length.
 * Returns null if arrays have different lengths (topology mismatch).
 */
export const lerpNodes = (nodesA, nodesB, t) => {
  if (!Array.isArray(nodesA) || !Array.isArray(nodesB)) return null;
  if (nodesA.length !== nodesB.length) return null;
  if (nodesA.length === 0) return [];
  const clampedT = Math.max(0, Math.min(1, t));
  return nodesA.map((a, i) => {
    const b = nodesB[i];
    
    // Helper to safely lerp a property
    const lerpProp = (prop, defaultVal = 0) => {
      const valA = Number.isFinite(a?.[prop]) ? a[prop] : defaultVal;
      const valB = Number.isFinite(b?.[prop]) ? b[prop] : defaultVal;
      return valA + (valB - valA) * clampedT;
    };

    const result = {
      x: lerpProp('x'),
      y: lerpProp('y'),
    };
    
    // Preserve and interpolate control points if they exist
    if (a.cp1x !== undefined || b.cp1x !== undefined) result.cp1x = lerpProp('cp1x');
    if (a.cp1y !== undefined || b.cp1y !== undefined) result.cp1y = lerpProp('cp1y');
    if (a.cp2x !== undefined || b.cp2x !== undefined) result.cp2x = lerpProp('cp2x');
    if (a.cp2y !== undefined || b.cp2y !== undefined) result.cp2y = lerpProp('cp2y');
    
    // Preserve other properties like isCurve from the start node (discrete, no interpolation)
    if (a.isCurve !== undefined) result.isCurve = a.isCurve;
    
    return result;
  });
};

/**
 * Linearly interpolate between two subpaths arrays.
 * Each subpath is an array of nodes. Returns null if structure doesn't match.
 */
export const lerpSubpaths = (subpathsA, subpathsB, t) => {
  if (!Array.isArray(subpathsA) || !Array.isArray(subpathsB)) return null;
  if (subpathsA.length !== subpathsB.length) return null;
  const result = [];
  for (let i = 0; i < subpathsA.length; i++) {
    const interpolated = lerpNodes(subpathsA[i], subpathsB[i], t);
    if (interpolated === null) return null; // topology mismatch
    result.push(interpolated);
  }
  return result;
};

// Calculate the actual bounding box extents from custom nodes
// Nodes are in normalized [-1, 1] space, returns the max extent in each direction
export const calculateNodeExtents = (nodes, rotation = 0) => {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    // Fallback to circular bounds
    return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  }

  const rotRad = (rotation * Math.PI) / 180;
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    const nx = Number(node?.x) || 0;
    const ny = Number(node?.y) || 0;
    
    // Apply rotation
    const rx = nx * cosR - ny * sinR;
    const ry = nx * sinR + ny * cosR;
    
    minX = Math.min(minX, rx);
    maxX = Math.max(maxX, rx);
    minY = Math.min(minY, ry);
    maxY = Math.max(maxY, ry);
  }

  return { minX, maxX, minY, maxY };
};
