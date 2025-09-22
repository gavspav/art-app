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
  let curr = nodes.map((node) => ({
    x: Number.isFinite(node?.x) ? Number(node.x) : 0,
    y: Number.isFinite(node?.y) ? Number(node.y) : 0,
  }));
  if (curr.length === target) return curr;
  if (curr.length > target) {
    return curr.slice(0, target);
  }
  while (curr.length < target) {
    const len = curr.length;
    for (let i = 0; i < len && curr.length < target; i++) {
      const next = (i + 1) % len;
      const mid = {
        x: (curr[i].x + curr[next].x) / 2,
        y: (curr[i].y + curr[next].y) / 2,
      };
      curr.splice(next, 0, mid);
      i++;
    }
  }
  return curr;
};
