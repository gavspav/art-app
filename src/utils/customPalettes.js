const CUSTOM_PALETTES_KEY = 'artapp-custom-palettes-v1';

const normalizeColor = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

export const normalizePaletteColors = (colors) => {
  const src = Array.isArray(colors) ? colors : [];
  const out = [];
  src.forEach((c) => {
    const normalized = normalizeColor(c);
    if (!normalized) return;
    out.push(normalized);
  });
  return out;
};

export const createCustomPaletteId = () => (
  `custom-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
);

export const normalizeCustomPaletteEntry = (entry, fallbackId = null) => {
  if (!entry || typeof entry !== 'object') return null;
  const colors = normalizePaletteColors(entry.colors);
  if (!colors.length) return null;
  const name = (typeof entry.name === 'string' && entry.name.trim())
    ? entry.name.trim()
    : 'Custom Palette';
  const id = (typeof entry.id === 'string' && entry.id.trim())
    ? entry.id.trim()
    : (fallbackId || createCustomPaletteId());
  return {
    id,
    name,
    colors,
    createdAt: entry.createdAt || new Date().toISOString(),
  };
};

export const sanitizeCustomPalettes = (list) => {
  const src = Array.isArray(list) ? list : [];
  const seen = new Set();
  const out = [];
  src.forEach((entry, idx) => {
    const normalized = normalizeCustomPaletteEntry(entry, `import-${idx}-${createCustomPaletteId()}`);
    if (!normalized) return;
    if (seen.has(normalized.id)) return;
    seen.add(normalized.id);
    out.push(normalized);
  });
  return out;
};

export const loadCustomPalettes = () => {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_PALETTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return sanitizeCustomPalettes(parsed);
  } catch (error) {
    console.warn('[CustomPalettes] Failed to load custom palettes', error);
    return [];
  }
};

export const saveCustomPalettes = (palettes = []) => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const next = sanitizeCustomPalettes(palettes);
    window.localStorage.setItem(CUSTOM_PALETTES_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn('[CustomPalettes] Failed to save custom palettes', error);
  }
};

export const createCustomPaletteEntry = ({ name, colors }) => {
  return normalizeCustomPaletteEntry({
    id: createCustomPaletteId(),
    name,
    colors,
    createdAt: new Date().toISOString(),
  });
};

export const mergeCustomPalettes = (existing = [], incoming = []) => {
  const base = sanitizeCustomPalettes(existing);
  const add = sanitizeCustomPalettes(incoming);
  const map = new Map(base.map(p => [p.id, p]));
  add.forEach((palette) => {
    if (!map.has(palette.id)) map.set(palette.id, palette);
  });
  return Array.from(map.values());
};
