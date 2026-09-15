export const getPointerHitRadius = (pointerType) => pointerType === 'touch' ? 24 : (pointerType === 'pen' ? 12 : 10);

export function findClosestPointIndex(points, target, radius) {
  let bestIndex = -1;
  let bestDistance = radius;
  points.forEach((point, index) => {
    const distance = Math.hypot(point.x - target.x, point.y - target.y);
    if (distance <= bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

export function getGesturePair(points) {
  const [a, b] = points;
  return {
    mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    distance: Math.max(8, Math.hypot(b.x - a.x, b.y - a.y)),
    angle: Math.atan2(b.y - a.y, b.x - a.x),
  };
}

// Apply the same movement to vertices and Bézier controls, preserving node metadata.
export function mapNodePoints(node, transform) {
  const result = { ...node, ...transform(node) };
  for (const prefix of ['cp1', 'cp2']) {
    if (Number.isFinite(node[`${prefix}x`]) && Number.isFinite(node[`${prefix}y`])) {
      const point = transform({ x: node[`${prefix}x`], y: node[`${prefix}y`] });
      result[`${prefix}x`] = point.x;
      result[`${prefix}y`] = point.y;
    }
  }
  return result;
}

export function moveNodeTo(node, x, y) {
  const dx = x - node.x;
  const dy = y - node.y;
  return mapNodePoints(node, point => ({ x: point.x + dx, y: point.y + dy }));
}

export function transformGesturePoint(point, start, next) {
  const scale = Math.max(0.05, Math.min(20, next.distance / start.distance));
  const angle = next.angle - start.angle;
  const dx = point.x - start.mid.x;
  const dy = point.y - start.mid.y;
  return {
    x: next.mid.x + scale * (dx * Math.cos(angle) - dy * Math.sin(angle)),
    y: next.mid.y + scale * (dx * Math.sin(angle) + dy * Math.cos(angle)),
  };
}
