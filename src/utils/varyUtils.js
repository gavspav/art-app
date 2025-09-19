// Utilities for routing parameter updates to either the active targets or the entire layer stack.
// Centralising this logic keeps behaviour consistent between controls, MIDI, and randomisation flows.

/**
 * Safely build the targeted/all layer id sets used by the controls layer targeting helpers.
 * @param {Function|undefined} buildTargetSet
 * @returns {{targeted:Set<string>, all:Set<string>}}
 */
export const buildLayerIdSets = (buildTargetSet) => {
  if (typeof buildTargetSet !== 'function') {
    return { targeted: new Set(), all: new Set() };
  }
  const targetedRaw = buildTargetSet({ mode: 'targeted' });
  const allRaw = buildTargetSet({ mode: 'all' });
  return {
    targeted: targetedRaw instanceof Set ? targetedRaw : new Set(targetedRaw || []),
    all: allRaw instanceof Set ? allRaw : new Set(allRaw || []),
  };
};

/**
 * Determine which layer ids should be updated for a parameter change based on the current target mode.
 * "individual" scopes to the active layer/selection; "global" broadcasts to every layer.
 *
 * @param {Object} opts
 * @param {Object} opts.currentLayer - currently active layer object
 * @param {Function|undefined} opts.buildTargetSet - helper that returns layer id sets
 * @param {string} [opts.targetMode] - 'individual' to affect the active layer/selection, 'global' to broadcast to all layers
 * @returns {{effective:Set<string>, targeted:Set<string>, all:Set<string>, mode:string}}
 */
export const resolveLayerTargets = ({ currentLayer, buildTargetSet, targetMode = 'individual' }) => {
  const { targeted, all } = buildLayerIdSets(buildTargetSet);

  const individualTargets = (() => {
    if (targeted.size > 0) return targeted;
    if (currentLayer?.id) return new Set([currentLayer.id]);
    return new Set();
  })();

  if (targetMode === 'global') {
    if (all.size > 0) {
      return { effective: all, targeted, all, mode: 'global' };
    }
    return { effective: individualTargets, targeted, all, mode: 'global' };
  }

  return { effective: individualTargets, targeted, all, mode: 'individual' };
};

/**
 * Convenience helper to apply a mapping function to the supplied layers array respecting the vary flag.
 * The updater delegate receives the layer instance and should return an updated copy when the id is
 * contained within the resolved effective set.
 */
export const applyWithVary = ({ layers, targets, updater }) => {
  if (!Array.isArray(layers) || !(targets instanceof Set) || targets.size === 0 || typeof updater !== 'function') {
    return layers;
  }
  try {
    console.debug('[applyWithVary] start', { targetCount: targets.size, targetIds: Array.from(targets || []) });
  } catch { /* noop */ }
  const result = layers.map(layer => {
    if (!targets.has(layer.id)) return layer;
    try { console.debug('[applyWithVary] updating layer', layer.id); } catch { /* noop */ }
    const patch = updater(layer);
    if (!patch || typeof patch !== 'object') return layer;
    if (patch === layer) return layer;
    return { ...layer, ...patch };
  });
  try {
    const updatedCount = result.reduce((acc, l, i) => acc + (l !== layers[i] ? 1 : 0), 0);
    console.debug('[applyWithVary] done', { updatedCount });
  } catch { /* noop */ }
  return result;
};
