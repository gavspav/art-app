export const PARAMETER_OPERATIONAL_MAX_HINT = Object.freeze({
  // Render/engine clamps to [0,1]
  opacity: '1',
  globalOpacity: '1',
  curviness: '1',
  wobble: '1',

  // Variation controls saturate in the variation engine (0..3)
  variationPosition: '3',
  variationShape: '3',
  variationAnim: '3',
  variationColor: '3',
  variationScale: '±3',

  // Cyclic angles
  movementAngle: '360',
  imageHue: '360',

  // Rotation UI wraps into [-180, 180]
  rotation: '±180',
});

export function getOperationalMaxHint(paramId) {
  const hint = PARAMETER_OPERATIONAL_MAX_HINT[paramId];
  return hint ? ` (${hint})` : '';
}

