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

export const resizeNodes = (nodes, desired) => {
  const target = Math.max(3, Math.round(Number(desired) || 0));
  if (target < 3) return computeInitialNodes(target);
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return computeInitialNodes(target);
  }
  const toPoint = (node) => ({
    x: Number.isFinite(node?.x) ? Number(node.x) : 0,
    y: Number.isFinite(node?.y) ? Number(node.y) : 0,
  });
  const distance = (a, b) => Math.hypot((b?.x || 0) - (a?.x || 0), (b?.y || 0) - (a?.y || 0));
  const EPSILON = 1e-9;
  let curr = nodes.map(toPoint);
  if (curr.length < 3) {
    return computeInitialNodes(target);
  }
  if (curr.length === target) return curr;
  // Expand by repeatedly splitting the longest edge so new points spread around the shape
  while (curr.length < target) {
    let longestIndex = -1;
    let longestLength = -Infinity;
    for (let i = 0; i < curr.length; i++) {
      const nextIndex = (i + 1) % curr.length;
      const len = distance(curr[i], curr[nextIndex]);
      if (len > longestLength) {
        longestLength = len;
        longestIndex = i;
      }
    }
    if (!(longestLength > EPSILON) || longestIndex < 0) {
      return computeInitialNodes(target);
    }
    const insertIndex = (longestIndex + 1) % curr.length;
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
    for (let i = 0; i < curr.length; i++) {
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
