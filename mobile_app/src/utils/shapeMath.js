const TWO_PI = Math.PI * 2;

const round = (value) => Number.parseFloat(Number(value).toFixed(3));

export const clampValue = (value, min, max) => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
};

export const clampPoint = (point, radius = 1) => {
  if (!point) return { x: 0, y: 0 };
  const x = Number.isFinite(point.x) ? point.x : 0;
  const y = Number.isFinite(point.y) ? point.y : 0;
  const dist = Math.hypot(x, y);
  if (dist <= radius || dist === 0) {
    return { x, y };
  }
  const scale = radius / dist;
  return { x: x * scale, y: y * scale };
};

export const createRegularPolygon = (sides = 5, radius = 1) => {
  const count = Math.max(3, Math.round(sides));
  const r = clampValue(radius, 0.2, 1.2);
  return Array.from({ length: count }).map((_, index) => {
    const angle = (TWO_PI * index) / count - Math.PI / 2;
    return {
      id: `node-${index}`,
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
    };
  });
};

export const jitterPolygon = (nodes, jitterAmount = 0.1) => {
  const amount = clampValue(jitterAmount, 0, 0.5);
  return nodes.map((node, index) => {
    const angle = Math.atan2(node.y, node.x);
    const magnitude = Math.hypot(node.x, node.y);
    const radialJitter = (Math.random() * 2 - 1) * amount;
    const angularJitter = (Math.random() * 2 - 1) * amount * 0.6;
    const nextMagnitude = Math.max(0.2, magnitude + radialJitter);
    const nextAngle = angle + angularJitter;
    return {
      id: node.id || `node-${index}`,
      x: Math.cos(nextAngle) * nextMagnitude,
      y: Math.sin(nextAngle) * nextMagnitude,
    };
  });
};

export const buildSmoothPath = (points, curviness = 0) => {
  if (!Array.isArray(points) || points.length === 0) return '';
  if (points.length === 1) {
    const { x, y } = points[0];
    return `M ${round(x)} ${round(y)} Z`;
  }

  const smoothing = clampValue(curviness, 0, 1);
  const formatted = points.map((p) => ({ x: round(p.x), y: round(p.y) }));
  const [first] = formatted;

  if (formatted.length === 2 || smoothing < 0.02) {
    const [, second] = formatted;
    return `M ${first.x} ${first.y} L ${second.x} ${second.y} Z`;
  }

  const n = formatted.length;
  const tension = 0.55 + smoothing * 0.35;
  let path = `M ${first.x} ${first.y}`;

  for (let i = 0; i < n; i += 1) {
    const p0 = formatted[(i - 1 + n) % n];
    const p1 = formatted[i];
    const p2 = formatted[(i + 1) % n];
    const p3 = formatted[(i + 2) % n];

    const cp1x = p1.x + ((p2.x - p0.x) * tension) / 6;
    const cp1y = p1.y + ((p2.y - p0.y) * tension) / 6;
    const cp2x = p2.x - ((p3.x - p1.x) * tension) / 6;
    const cp2y = p2.y - ((p3.y - p1.y) * tension) / 6;

    path += ` C ${round(cp1x)} ${round(cp1y)} ${round(cp2x)} ${round(cp2y)} ${round(p2.x)} ${round(p2.y)}`;
  }

  path += ' Z';
  return path;
};

export const deriveLayerPoints = (nodes, { size, variationShape = 0, variationPosition = 0, layerIndex = 0 }) => {
  if (!Array.isArray(nodes)) return [];
  const baseFactor = Math.max(0.2, size) * 100;
  const shapeInfluence = clampValue(variationShape, 0, 1) * layerIndex;
  const scaleFactor = Math.max(0.05, 1 + shapeInfluence * 0.7);
  const wobble = shapeInfluence > 0 ? shapeInfluence * 0.45 : 0;
  const factor = baseFactor * scaleFactor;

  const angle = layerIndex * 2.2;
  const shiftMagnitude = variationPosition * layerIndex * 32;
  const tx = Math.cos(angle) * shiftMagnitude;
  const ty = Math.sin(angle) * shiftMagnitude;

  return nodes.map((node, index) => {
    const nodeAngle = Math.atan2(node.y, node.x) + wobble * Math.sin(index + layerIndex * 0.8);
    const magnitude = Math.hypot(node.x, node.y);
    const stretchedMag = magnitude * (1 + wobble * Math.cos(index * 1.2 + layerIndex));
    const x = Math.cos(nodeAngle) * stretchedMag * factor + tx;
    const y = Math.sin(nodeAngle) * stretchedMag * factor + ty;
    return {
      id: node.id || `node-${index}`,
      x,
      y,
    };
  });
};
