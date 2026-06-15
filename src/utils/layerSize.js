const DEFAULT_RADIUS = 0.125;
const EPSILON = 1e-9;

const positiveFinite = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > EPSILON ? parsed : null;
};

export const getEffectiveRadiusFactor = (layer) => {
  if (layer?.viewBoxMapped) return 0.5;

  const radius = positiveFinite(layer?.radiusFactor);
  if (radius != null) return radius;

  const axes = [
    positiveFinite(layer?.radiusFactorX),
    positiveFinite(layer?.radiusFactorY),
  ].filter(value => value != null);
  if (axes.length > 0) {
    return axes.reduce((sum, value) => sum + value, 0) / axes.length;
  }

  return DEFAULT_RADIUS;
};

export const buildRadiusFactorPatch = (layer, targetRadius, ratioOverride = null) => {
  const nextRadius = Number(targetRadius);
  if (!Number.isFinite(nextRadius)) return {};

  const baseRadius = getEffectiveRadiusFactor(layer);
  const ratio = Number.isFinite(ratioOverride) && ratioOverride > 0
    ? ratioOverride
    : nextRadius / baseRadius;
  const baseX = layer?.viewBoxMapped
    ? 0.5
    : (positiveFinite(layer?.radiusFactorX) ?? baseRadius);
  const baseY = layer?.viewBoxMapped
    ? 0.5
    : (positiveFinite(layer?.radiusFactorY) ?? baseRadius);

  return {
    radiusFactor: nextRadius,
    radiusFactorX: baseX * ratio,
    radiusFactorY: baseY * ratio,
    ...(layer?.viewBoxMapped ? { viewBoxMapped: false } : {}),
  };
};
