// Every layer parameter can be addressed by several ids (stable id, name, 1-based
// index, or "all"). Mapping stores may hold any of them, so lookups check each alias.
export const buildLayerParamIds = (layer, paramId, layerIndex = null) => {
  const layerNameKey = (layer?.name || 'Layer').toString();
  const stableLayerKey = String(layer?.id ?? layerNameKey);
  const layerKeys = Array.from(new Set([stableLayerKey, layerNameKey].filter(Boolean)));
  const aliases = layerKeys.map((layerKey) => `layer:${layerKey}:${paramId}`);
  if (Number.isFinite(layerIndex)) {
    aliases.push(`layer:${Math.max(1, Math.floor(layerIndex) + 1)}:${paramId}`);
  } else {
    const nameMatch = /^Layer\s+(\d+)$/i.exec(layerNameKey);
    if (nameMatch) aliases.push(`layer:${nameMatch[1]}:${paramId}`);
  }
  aliases.push(`layer:all:${paramId}`);
  return Array.from(new Set(aliases.filter(Boolean)));
};

export const findFirstMappedParamId = (mappings, paramIds) => {
  const ids = Array.isArray(paramIds) ? paramIds : [];
  for (const id of ids) {
    if (id && mappings?.[id]) return id;
  }
  return ids[0] || null;
};

export const resolveParamIds = (paramId, paramAliases) => {
  const ids = Array.isArray(paramAliases) && paramAliases.length ? paramAliases : [paramId];
  return Array.from(new Set(ids.filter(Boolean)));
};
