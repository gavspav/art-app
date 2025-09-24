// Enhanced SVG import utilities with better scaling, positioning, and parameter support
import { DEFAULT_LAYER } from '../constants/defaults';

/**
 * Parse SVG and extract all drawable elements with proper transforms
 * Returns structured data for creating layers with proper scaling
 */
export function parseSVGForImport(svgString, options = {}) {
  const {
    targetScale = 0.3,  // Default scale for imported shapes (30% of canvas)
    centerOnCanvas = true,  // Center the shape on canvas
    preserveAspectRatio = true,
    extractColors = true,
  } = options;

  if (!svgString || typeof svgString !== 'string') {
    throw new Error('Invalid SVG string');
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    const classStyles = parseEmbeddedStyles(doc);
    
    if (!svgEl) {
      throw new Error('No SVG element found');
    }

    // Extract viewBox and dimensions
    const viewBox = parseViewBox(svgEl);
    const dimensions = getSVGDimensions(svgEl, viewBox);
    
    // Extract all paths and shapes
    const shapes = extractAllShapes(svgEl, dimensions, classStyles);
    
    // Extract colors if requested
    const colors = extractColors ? extractSVGColors(svgEl, classStyles) : [];
    
    // Calculate optimal scale and position
    const transform = calculateOptimalTransform(shapes, dimensions, {
      targetScale,
      centerOnCanvas,
      preserveAspectRatio
    });

    return {
      shapes,
      colors,
      transform,
      viewBox,
      dimensions,
      metadata: {
        elementCount: shapes.length,
        hasMultiplePaths: shapes.length > 1,
        boundingBox: calculateBoundingBox(shapes)
      }
    };
  } catch (error) {
    console.error('Error parsing SVG:', error);
    throw error;
  }
}

/**
 * Parse viewBox attribute
 */
function parseViewBox(svgEl) {
  const vb = svgEl.getAttribute('viewBox');
  if (!vb) return null;
  
  const parts = vb.trim().split(/[\s,]+/).map(parseFloat);
  if (parts.length !== 4 || parts.some(n => !Number.isFinite(n))) {
    return null;
  }
  
  return {
    minX: parts[0],
    minY: parts[1],
    width: parts[2],
    height: parts[3]
  };
}

/**
 * Get SVG dimensions from attributes or viewBox
 */
function getSVGDimensions(svgEl, viewBox) {
  const width = parseFloat(svgEl.getAttribute('width')) || (viewBox?.width) || 100;
  const height = parseFloat(svgEl.getAttribute('height')) || (viewBox?.height) || 100;
  
  return {
    width: Math.abs(width),
    height: Math.abs(height),
    aspectRatio: width / height
  };
}

/**
 * Extract all drawable shapes from SVG
 */
function extractAllShapes(svgEl, dimensions, classStyles = {}) {
  const shapes = [];
  const elements = svgEl.querySelectorAll('path, polygon, polyline, circle, ellipse, rect, line');
  
  elements.forEach((el, index) => {
    try {
      const shape = extractShape(el, classStyles);
      if (!shape || shape.points.length < 3) return;

      // Compute shape bounding box to detect full-background rectangles
      const bboxTargets = Array.isArray(shape.subpaths) && shape.subpaths.length > 0
        ? shape.subpaths.map(sp => ({ points: sp }))
        : [{ points: shape.points }];
      const bbox = calculateBoundingBox(bboxTargets);
      const isFullWidth = bbox.width >= 0.95 * dimensions.width;
      const isFullHeight = bbox.height >= 0.95 * dimensions.height;
      const isBackgroundRect = (shape.type === 'rect') && isFullWidth && isFullHeight;
      if (isBackgroundRect) return; // skip likely background

      shapes.push({
        ...shape,
        id: `shape_${index}`,
        originalElement: el.tagName.toLowerCase()
      });
    } catch (err) {
      console.warn('Failed to extract SVG element', {
        tag: el?.tagName,
        index,
        id: el?.getAttribute?.('id') || null,
        className: el?.getAttribute?.('class') || null,
        error: err instanceof Error ? err.message : err
      });
    }
  });
  
  return shapes;
}

/**
 * Extract points from a single shape element
 */
function extractShape(element, classStyles = {}) {
  const tag = element.tagName.toLowerCase();
  let points = [];
  let subpaths = null;
  const attributes = collectShapeAttributes(element, classStyles);
  
  switch (tag) {
    case 'path':
      const sampled = samplePathElement(element);
      points = sampled.points;
      if (Array.isArray(sampled.subpaths) && sampled.subpaths.length > 0) {
        subpaths = sampled.subpaths;
      }
      break;
    case 'polygon':
    case 'polyline':
      points = parsePolygonPoints(element.getAttribute('points'));
      break;
    case 'circle':
      points = generateCirclePoints(
        parseFloat(element.getAttribute('cx') || 0),
        parseFloat(element.getAttribute('cy') || 0),
        parseFloat(element.getAttribute('r') || 0)
      );
      break;
    case 'ellipse':
      points = generateEllipsePoints(
        parseFloat(element.getAttribute('cx') || 0),
        parseFloat(element.getAttribute('cy') || 0),
        parseFloat(element.getAttribute('rx') || 0),
        parseFloat(element.getAttribute('ry') || 0)
      );
      break;
    case 'rect':
      points = generateRectPoints(
        parseFloat(element.getAttribute('x') || 0),
        parseFloat(element.getAttribute('y') || 0),
        parseFloat(element.getAttribute('width') || 0),
        parseFloat(element.getAttribute('height') || 0),
        parseFloat(element.getAttribute('rx') || 0),
        parseFloat(element.getAttribute('ry') || 0)
      );
      break;
    case 'line':
      points = [
        { x: parseFloat(element.getAttribute('x1') || 0), y: parseFloat(element.getAttribute('y1') || 0) },
        { x: parseFloat(element.getAttribute('x2') || 0), y: parseFloat(element.getAttribute('y2') || 0) }
      ];
      break;
  }
  
  // Apply transforms if present
  const transform = element.getAttribute('transform');
  if (transform && points.length > 0) {
    if (Array.isArray(subpaths) && subpaths.length > 0) {
      subpaths = subpaths.map(sp => applyTransform(sp, transform));
      points = subpaths.flat();
    } else {
      points = applyTransform(points, transform);
    }
  }
  
  // Apply parent transforms
  let parent = element.parentElement;
  while (parent && parent !== element.ownerDocument.documentElement) {
    const parentTransform = parent.getAttribute('transform');
    if (parentTransform) {
      if (Array.isArray(subpaths) && subpaths.length > 0) {
        subpaths = subpaths.map(sp => applyTransform(sp, parentTransform));
        points = subpaths.flat();
      } else {
        points = applyTransform(points, parentTransform);
      }
    }
    parent = parent.parentElement;
  }
  
  return {
    type: tag,
    points,
    subpaths,
    attributes
  };
}

function collectShapeAttributes(element, classStyles = {}) {
  const styleAttrs = ['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'fill-rule', 'clip-rule'];
  const collected = {};

  const nodes = [];
  let current = element;
  while (current && current !== element.ownerDocument.documentElement) {
    nodes.push(current);
    current = current.parentElement;
  }
  nodes.reverse();

  const applyFromNode = (node) => {
    if (!node) return;
    const styleAttr = node.getAttribute('style') || '';
    const styleEntries = {};
    if (styleAttr) {
      styleAttr.split(';').forEach(part => {
        if (!part) return;
        const [rawProp, rawVal] = part.split(':');
        if (!rawProp || rawVal == null) return;
        const prop = rawProp.trim().toLowerCase();
        const val = rawVal.trim();
        styleEntries[prop] = val;
      });
    }

    const classAttr = node.getAttribute('class');
    if (classAttr) {
      classAttr.split(/\s+/).forEach(cls => {
        const entry = classStyles[cls];
        if (!entry) return;
        styleAttrs.forEach(attr => {
          const value = entry[attr];
          if (value != null && value !== '') {
            collected[attr] = value;
          }
        });
      });
    }

    styleAttrs.forEach(attr => {
      const direct = node.getAttribute(attr);
      if (direct != null && direct !== '') {
        collected[attr] = direct;
        return;
      }
      const styleVal = styleEntries[attr];
      if (styleVal != null && styleVal !== '') {
        collected[attr] = styleVal;
      }
    });
  };

  nodes.forEach(applyFromNode);
  return collected;
}

function parseEmbeddedStyles(doc) {
  const styleNodes = doc.querySelectorAll('style');
  const classStyles = {};
  styleNodes.forEach(node => {
    const text = node.textContent || '';
    const regex = /\.([a-zA-Z0-9_-]+)\s*\{([^}]+)\}/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const className = match[1];
      const body = match[2];
      const decls = body.split(';');
      const styleEntry = classStyles[className] || {};
      decls.forEach(decl => {
        if (!decl) return;
        const [rawProp, rawVal] = decl.split(':');
        if (!rawProp || rawVal == null) return;
        const prop = rawProp.trim().toLowerCase();
        const val = rawVal.trim();
        if (['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'fill-rule', 'clip-rule'].includes(prop)) {
          styleEntry[prop] = val;
        }
      });
      classStyles[className] = styleEntry;
    }
  });
  return classStyles;
}

/**
 * Sample points from a path element
 */
function samplePathElement(pathEl, sampleCount = 0) {
  try {
    const d = pathEl.getAttribute('d') || '';
    const segments = splitPathDataIntoSubpaths(d);
    const subpaths = [];
    const allPoints = [];

    const sampleSegment = (pathNode) => {
      const totalLength = pathNode.getTotalLength();
      if (!totalLength || totalLength <= 0) return [];
      const count = sampleCount || Math.max(32, Math.min(256, Math.floor(totalLength / 2)));
      const pts = [];
      for (let i = 0; i <= count; i++) {
        const point = pathNode.getPointAtLength((i / count) * totalLength);
        pts.push({ x: point.x, y: point.y });
      }
      return pts;
    };

    const svgRoot = pathEl.ownerSVGElement || pathEl;
    const doc = pathEl.ownerDocument || (typeof document !== 'undefined' ? document : null);
    const targetSegments = segments.length > 0 ? segments : (d ? [d] : []);

    targetSegments.forEach(seg => {
      if (!seg || !doc) return;
      const tempPath = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      tempPath.setAttribute('d', seg);
      svgRoot.appendChild(tempPath);
      try {
        const pts = sampleSegment(tempPath);
        if (pts.length >= 3) {
          subpaths.push(pts);
          allPoints.push(...pts);
        }
      } finally {
        tempPath.remove();
      }
    });

    return { points: allPoints, subpaths };
  } catch (error) {
    console.warn('Error sampling path:', error);
    return { points: [], subpaths: [] };
  }
}

function splitPathDataIntoSubpaths(d = '') {
  const segments = [];
  if (!d || typeof d !== 'string') return segments;
  let current = '';
  for (let i = 0; i < d.length; i++) {
    const ch = d[i];
    if ((ch === 'M' || ch === 'm') && current.trim().length > 0) {
      segments.push(current.trim());
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) {
    segments.push(current.trim());
  }
  return segments;
}

/**
 * Generate circle points
 */
function generateCirclePoints(cx, cy, r, segments = 64) {
  if (r <= 0) return [];
  
  const points = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push({
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r
    });
  }
  
  return points;
}

/**
 * Generate ellipse points
 */
function generateEllipsePoints(cx, cy, rx, ry, segments = 64) {
  if (rx <= 0 || ry <= 0) return [];
  
  const points = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push({
      x: cx + Math.cos(angle) * rx,
      y: cy + Math.sin(angle) * ry
    });
  }
  
  return points;
}

/**
 * Generate rectangle points (with optional rounded corners)
 */
function generateRectPoints(x, y, width, height, rx = 0, ry = 0) {
  if (width <= 0 || height <= 0) return [];
  
  // Simple rectangle without rounded corners
  if (rx <= 0 && ry <= 0) {
    return [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height }
    ];
  }
  
  // Rounded rectangle
  const points = [];
  const segments = 8; // Points per corner
  
  rx = Math.min(rx, width / 2);
  ry = Math.min(ry || rx, height / 2);
  
  // Top edge
  points.push({ x: x + rx, y });
  points.push({ x: x + width - rx, y });
  
  // Top-right corner
  for (let i = 0; i <= segments; i++) {
    const angle = -Math.PI / 2 + (i / segments) * (Math.PI / 2);
    points.push({
      x: x + width - rx + Math.cos(angle) * rx,
      y: y + ry + Math.sin(angle) * ry
    });
  }
  
  // Right edge
  points.push({ x: x + width, y: y + ry });
  points.push({ x: x + width, y: y + height - ry });
  
  // Bottom-right corner
  for (let i = 0; i <= segments; i++) {
    const angle = 0 + (i / segments) * (Math.PI / 2);
    points.push({
      x: x + width - rx + Math.cos(angle) * rx,
      y: y + height - ry + Math.sin(angle) * ry
    });
  }
  
  // Bottom edge
  points.push({ x: x + width - rx, y: y + height });
  points.push({ x: x + rx, y: y + height });
  
  // Bottom-left corner
  for (let i = 0; i <= segments; i++) {
    const angle = Math.PI / 2 + (i / segments) * (Math.PI / 2);
    points.push({
      x: x + rx + Math.cos(angle) * rx,
      y: y + height - ry + Math.sin(angle) * ry
    });
  }
  
  // Left edge
  points.push({ x, y: y + height - ry });
  points.push({ x, y: y + ry });
  
  // Top-left corner
  for (let i = 0; i <= segments; i++) {
    const angle = Math.PI + (i / segments) * (Math.PI / 2);
    points.push({
      x: x + rx + Math.cos(angle) * rx,
      y: y + ry + Math.sin(angle) * ry
    });
  }
  
  return points;
}

/**
 * Apply SVG transform to points
 */
function applyTransform(points, transformStr) {
  if (!transformStr || !points.length) return points;
  
  // Parse transform string (simplified - handles common cases)
  const transforms = [];
  const regex = /(\w+)\(([^)]+)\)/g;
  let match;
  
  while ((match = regex.exec(transformStr)) !== null) {
    transforms.push({
      type: match[1],
      params: match[2].split(/[\s,]+/).map(parseFloat)
    });
  }
  
  // Apply transforms in order
  let result = [...points];
  
  for (const transform of transforms) {
    const { type, params } = transform;
    
    switch (type) {
      case 'translate': {
        const tx = params[0] || 0;
        const ty = params[1] || 0;
        result = result.map(p => ({ x: p.x + tx, y: p.y + ty }));
        break;
      }

      case 'scale': {
        const sx = params[0] || 1;
        const sy = params[1] || sx;
        result = result.map(p => ({ x: p.x * sx, y: p.y * sy }));
        break;
      }

      case 'rotate': {
        const angle = (params[0] || 0) * Math.PI / 180;
        const cx = params[1] || 0;
        const cy = params[2] || 0;
        result = result.map(p => {
          const dx = p.x - cx;
          const dy = p.y - cy;
          return {
            x: cx + dx * Math.cos(angle) - dy * Math.sin(angle),
            y: cy + dx * Math.sin(angle) + dy * Math.cos(angle)
          };
        });
        break;
      }

      case 'matrix': {
        if (params.length === 6) {
          const [a, b, c, d, e, f] = params;
          result = result.map(p => ({
            x: a * p.x + c * p.y + e,
            y: b * p.x + d * p.y + f
          }));
        }
        break;
      }
    }
  }
  
  return result;
}

/**
 * Extract colors from SVG
 */
function extractSVGColors(svgEl, classStyles = {}) {
  const colors = new Set();
  const elements = svgEl.querySelectorAll('*');
  
  elements.forEach(el => {
    // Check fill and stroke attributes
    ['fill', 'stroke'].forEach(attr => {
      const value = el.getAttribute(attr);
      if (value && value !== 'none' && value !== 'transparent') {
        const color = normalizeColor(value);
        if (color) colors.add(color);
      }
    });
    
    // Check style attribute
    const style = el.getAttribute('style');
    if (style) {
      const fillMatch = style.match(/fill:\s*([^;]+)/);
      const strokeMatch = style.match(/stroke:\s*([^;]+)/);
      
      [fillMatch, strokeMatch].forEach(match => {
        if (match && match[1] && match[1] !== 'none') {
          const color = normalizeColor(match[1]);
          if (color) colors.add(color);
        }
      });
    }
  });

  Object.values(classStyles || {}).forEach(entry => {
    ['fill', 'stroke'].forEach(key => {
      const value = entry?.[key];
      if (value && value !== 'none' && value !== 'transparent') {
        const color = normalizeColor(value);
        if (color) colors.add(color);
      }
    });
  });

  return Array.from(colors);
}

/**
 * Normalize color to hex format
 */
function normalizeColor(color) {
  if (!color) return null;
  
  // Already hex
  if (color.startsWith('#')) {
    return color.length === 4 
      ? '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3]
      : color;
  }
  
  // Named colors (simplified - add more as needed)
  const namedColors = {
    'red': '#ff0000',
    'green': '#008000',
    'blue': '#0000ff',
    'yellow': '#ffff00',
    'cyan': '#00ffff',
    'magenta': '#ff00ff',
    'black': '#000000',
    'white': '#ffffff',
    'gray': '#808080',
    'grey': '#808080'
  };
  
  if (namedColors[color.toLowerCase()]) {
    return namedColors[color.toLowerCase()];
  }
  
  // RGB/RGBA
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
    const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
    const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }
  
  return null;
}

/**
 * Calculate bounding box for shapes
 */
function calculateBoundingBox(shapes) {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  
  shapes.forEach(shape => {
    shape.points.forEach(p => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });
  });
  
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2
  };
}

/**
 * Calculate optimal transform for canvas placement
 */
function calculateOptimalTransform(shapes, dimensions, options) {
  const { targetScale, centerOnCanvas, preserveAspectRatio } = options;
  
  if (!shapes.length) {
    return {
      scale: targetScale,
      position: { x: 0.5, y: 0.5 }
    };
  }
  
  const bbox = calculateBoundingBox(shapes);
  
  // Calculate scale to fit target size
  let scale = targetScale;
  
  if (preserveAspectRatio) {
    // Maintain aspect ratio
    const aspectRatio = bbox.width / bbox.height;
    if (aspectRatio > 1) {
      // Wider than tall
      scale = targetScale;
    } else {
      // Taller than wide
      scale = targetScale * aspectRatio;
    }
  }
  
  // Calculate position
  let position = { x: 0.5, y: 0.5 };
  
  if (!centerOnCanvas) {
    // Use original position from SVG
    position = {
      x: bbox.centerX / dimensions.width,
      y: bbox.centerY / dimensions.height
    };
  }
  
  // Clamp to canvas bounds with small margin
  const margin = 0.02;
  position = {
    x: Math.max(margin, Math.min(1 - margin, position.x || 0.5)),
    y: Math.max(margin, Math.min(1 - margin, position.y || 0.5))
  };
  
  // Prevent extreme scales (avoid zero or enormous values)
  const minScale = 0.01;
  const maxScale = 5;
  const safeScale = Math.max(minScale, Math.min(maxScale, Number.isFinite(scale) ? scale : targetScale));
  
  return {
    scale: safeScale,
    position,
    bbox
  };
}

/**
 * Convert parsed SVG data to layer nodes format
 */
const resolveColorValue = (color) => {
  if (!color) return null;
  const trimmed = String(color).trim();
  if (!trimmed || trimmed.toLowerCase() === 'none' || trimmed.toLowerCase() === 'transparent') {
    return null;
  }
  return normalizeColor(trimmed) || trimmed;
};

const resolveOpacity = (value) => {
  if (value == null) return null;
  const num = parseFloat(value);
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.min(1, num));
};

export function convertToLayerNodes(shapes) {
  if (!shapes || !shapes.length) {
    return {
      nodes: [],
      subpaths: null,
      styles: null
    };
  }
  
  // Merge all shapes into a single set of nodes
  const allPoints = [];
  const subpaths = [];
  const subpathMeta = [];
  const styleList = [];
  
  shapes.forEach((shape, shapeIndex) => {
    if (!shape || !shape.points || shape.points.length === 0) return;

    const attr = shape.attributes || {};
    const fillRaw = attr.fill;
    const strokeRaw = attr.stroke;
    const fill = resolveColorValue(fillRaw);
    const stroke = resolveColorValue(strokeRaw);
    const strokeWidthRaw = attr['stroke-width'] ?? attr.strokeWidth;
    const strokeWidth = Number.isFinite(parseFloat(strokeWidthRaw)) ? parseFloat(strokeWidthRaw) : null;
    const fillOpacity = resolveOpacity(attr['fill-opacity']);
    const strokeOpacity = resolveOpacity(attr['stroke-opacity']);
    const opacity = resolveOpacity(attr.opacity);
    const fillSpecified = Object.prototype.hasOwnProperty.call(attr, 'fill');
    const strokeSpecified = Object.prototype.hasOwnProperty.call(attr, 'stroke');
    const fillIsNone = fillSpecified && typeof fillRaw === 'string' && fillRaw.trim().toLowerCase() === 'none';
    const strokeIsNone = strokeSpecified && typeof strokeRaw === 'string' && strokeRaw.trim().toLowerCase() === 'none';
    const fillRule = attr['fill-rule'] ?? attr.fillRule ?? null;
    const clipRule = attr['clip-rule'] ?? attr.clipRule ?? null;

    const effectiveOpacity = opacity != null
      ? opacity
      : (fillOpacity != null ? fillOpacity : 1);
    const discardShape = effectiveOpacity <= 0.01;

    const styles = {
      fill,
      stroke,
      strokeWidth,
      fillOpacity,
      strokeOpacity,
      opacity,
      fillSpecified,
      strokeSpecified,
      fillIsNone,
      strokeIsNone,
      fillRule,
      clipRule,
    };
    const hasStyle = [fill, stroke, strokeWidth, fillOpacity, strokeOpacity, opacity].some(v => v != null);

    if (discardShape) {
      return;
    }

    const shapeSubpaths = Array.isArray(shape.subpaths) && shape.subpaths.length > 0
      ? shape.subpaths
      : [shape.points];

    shapeSubpaths.forEach((pathPoints, subIndex) => {
      if (!Array.isArray(pathPoints) || pathPoints.length < 3) return;
      const bbox = calculateBoundingBox([{ points: pathPoints }]);
      const area = Math.abs(bbox.width * bbox.height);
      const minDim = Math.min(bbox.width, bbox.height);
      const isTiny = area < 1e-4 && minDim < 0.02;
      if (isTiny) return;

      subpaths.push(pathPoints);
      allPoints.push(...pathPoints);
      subpathMeta.push({
        sourceShapeId: shape.id,
        sourceShapeIndex: shapeIndex,
        subpathIndex: subIndex,
        fillRule: styles.fillRule || null,
        clipRule: styles.clipRule || null,
        hasStyle,
        groupId: shape.id,
      });
      if (hasStyle) {
        styleList.push({ ...styles, groupId: shape.id });
      } else {
        styleList.push(null);
      }
    });
  });

  if (allPoints.length < 3) {
    return {
      nodes: [],
      subpaths: null,
      styles: null,
      subpathGroups: null,
    };
  }
  
  // Normalize points to [-1, 1] range centered at origin
  const bbox = calculateBoundingBox([{ points: allPoints }]);
  const centerX = bbox.centerX;
  const centerY = bbox.centerY;
  const scale = Math.max(bbox.width, bbox.height) / 2 || 1;
  
  const normalizedNodes = allPoints.map(p => ({
    x: (p.x - centerX) / scale,
    y: (p.y - centerY) / scale
  }));
  
  const normalizedSubpaths = subpaths.map(path => 
    path.map(p => ({
      x: (p.x - centerX) / scale,
      y: (p.y - centerY) / scale
    }))
  );

  const hasSubpaths = normalizedSubpaths.length > 0;
  const normalizedStyles = hasSubpaths
    ? normalizeSubpathStyles(styleList, normalizedSubpaths.length)
    : null;
  const subpathGroups = hasSubpaths
    ? buildSubpathGroups(subpathMeta, normalizedStyles)
    : null;

  return {
    nodes: normalizedNodes,
    subpaths: hasSubpaths ? normalizedSubpaths : null,
    styles: normalizedStyles,
    subpathGroups,
  };
}

function normalizeSubpathStyles(styles, expectedLength) {
  if (!Array.isArray(styles) || styles.length === 0) return null;
  const normalized = [];
  for (let i = 0; i < expectedLength; i++) {
    const style = styles[i];
    if (!style) {
      normalized.push(null);
      continue;
    }
    normalized.push({
      fill: style.fill ?? null,
      stroke: style.stroke ?? null,
      strokeWidth: style.strokeWidth ?? null,
      fillOpacity: style.fillOpacity ?? null,
      strokeOpacity: style.strokeOpacity ?? null,
      opacity: style.opacity ?? null,
      fillSpecified: style.fillSpecified ?? false,
      strokeSpecified: style.strokeSpecified ?? false,
      fillIsNone: style.fillIsNone ?? (style.fillSpecified ? style.fill == null : false),
      strokeIsNone: style.strokeIsNone ?? (style.strokeSpecified ? style.stroke == null : false),
      fillRule: style.fillRule ?? null,
      clipRule: style.clipRule ?? null,
      groupId: style.groupId ?? null,
    });
  }
  return normalized;
}

function buildSubpathGroups(metaList, styles) {
  if (!Array.isArray(metaList) || metaList.length === 0) return null;
  const groups = new Map();
  const styleArray = Array.isArray(styles) ? styles : [];

  metaList.forEach((meta, idx) => {
    if (!meta) return;
    const style = styleArray[idx] || null;
    const groupId = style?.groupId || meta.groupId || meta.sourceShapeId || `group_${idx}`;
    const fillRuleRaw = style?.fillRule || meta.fillRule || null;
    const fillRule = fillRuleRaw && typeof fillRuleRaw === 'string' && fillRuleRaw.toLowerCase() === 'evenodd'
      ? 'evenodd'
      : 'nonzero';

    const key = `${groupId}::${fillRule}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        id: groupId,
        fillRule,
        indices: []
      };
      groups.set(key, group);
    }
    group.indices.push(idx);
  });

  const result = Array.from(groups.values()).filter(group => Array.isArray(group.indices) && group.indices.length > 0);
  return result.length ? result : null;
}

function applySubpathStyleFallbacks(styles, count, palette = []) {
  if (count <= 0) {
    return { styles: null, palette: Array.isArray(palette) ? [...palette] : [] };
  }

  const normalized = Array.isArray(styles) ? styles.slice(0, count) : [];
  const output = [];
  const paletteSet = new Set((Array.isArray(palette) ? palette : []).filter(Boolean));
  for (let i = 0; i < count; i++) {
    const existing = normalized[i] || {};
    const result = { ...existing };

    const wantsFill = !(result.fillSpecified && result.fillIsNone);
    if (!result.fill && wantsFill) {
      const fallbackColor = '#000000';
      result.fill = fallbackColor;
      paletteSet.add(fallbackColor);
    }
    if (!wantsFill) {
      result.fill = null;
    }

    const wantsStroke = !(result.strokeSpecified && result.strokeIsNone);
    if (!wantsStroke) {
      result.stroke = null;
    }

    if ((result.fill && wantsFill) || (result.stroke && wantsStroke)) {
      if (wantsFill && result.fillOpacity == null) result.fillOpacity = 1;
      if (result.stroke && wantsStroke && result.strokeOpacity == null) result.strokeOpacity = 1;
      if (result.opacity == null) result.opacity = 1;
    }

    if (wantsFill && result.fill) paletteSet.add(result.fill);
    if (result.stroke && wantsStroke) paletteSet.add(result.stroke);

    output.push(Object.keys(result).length ? result : null);
  }

  const hasStyled = output.some(style => style && (style.fill || style.stroke));
  return {
    styles: hasStyled ? output : null,
    palette: Array.from(paletteSet)
  };
}

/**
 * Create a layer configuration from parsed SVG
 */
export function createLayerFromSVG(svgData, fileName = 'SVG Layer', options = {}) {
  const {
    nodes,
    subpaths,
    styles,
    subpathGroups
  } = convertToLayerNodes(svgData.shapes, svgData.transform);
  const subpathCount = Array.isArray(subpaths) ? subpaths.length : 0;
  const palette = Array.isArray(svgData.colors) ? svgData.colors : [];
  const { styles: resolvedSubpathStyles, palette: paletteWithFallbacks } = applySubpathStyleFallbacks(styles, subpathCount, palette);
  const finalPalette = (Array.isArray(paletteWithFallbacks) && paletteWithFallbacks.length)
    ? paletteWithFallbacks
    : (palette.length ? palette : []);
  
  const layer = {
    ...DEFAULT_LAYER,
    ...options,
    name: fileName.replace(/\.[^/.]+$/, ''),
    layerType: 'shape',
    nodes: subpaths ? null : nodes,  // Use subpaths if multiple paths
    subpaths: subpaths,
    subpathStyles: resolvedSubpathStyles,
    subpathGroups: Array.isArray(subpathGroups) && subpathGroups.length ? subpathGroups : null,
    syncNodesToNumSides: false,
    viewBoxMapped: false,
    
    // Shape parameters - start with clean imported shape
    curviness: 0,
    noiseAmount: 0,
    wobble: 0,
    numSides: nodes.length,
    
    // Position and scale
    position: {
      ...DEFAULT_LAYER.position,
      x: svgData.transform.position.x,
      y: svgData.transform.position.y,
      scale: svgData.transform.scale
    },
    
    // Apply extracted colors if available
    colors: finalPalette.length > 0 ? finalPalette : DEFAULT_LAYER.colors,
    numColors: finalPalette.length > 0 ? finalPalette.length : DEFAULT_LAYER.numColors,
    
    // Animation - can be customized after import
    movementStyle: options.movementStyle || 'still',
    movementSpeed: options.movementSpeed || 0,
    scaleSpeed: options.scaleSpeed || 0,
    
    // Make visible
    visible: true,
    opacity: options.opacity || 100
  };
  
  return layer;
}

/**
 * Enhanced SVG import with multiple file support
 */
export async function importSVGFiles(files, options = {}) {
  const {
    targetScale = 0.3,
    distributePositions = true,  // Distribute multiple files across canvas
    applyAnimation = false,
    animationStyle = 'drift',
    animationSpeed = 1,
    extractColors = true
  } = options;
  
  const layers = [];
  const errors = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    try {
      const text = await file.text();
      const svgData = parseSVGForImport(text, {
        targetScale,
        centerOnCanvas: files.length === 1,  // Only center if single file
        extractColors
      });
      
      // Adjust position for multiple files
      if (files.length > 1 && distributePositions) {
        // Distribute in a grid or circle
        const angle = (i / files.length) * Math.PI * 2;
        const radius = 0.3;
        svgData.transform.position = {
          x: 0.5 + Math.cos(angle) * radius,
          y: 0.5 + Math.sin(angle) * radius
        };
      }
      
      const layerOptions = {
        opacity: 100,
        movementStyle: applyAnimation ? animationStyle : 'still',
        movementSpeed: applyAnimation ? animationSpeed : 0,
        scaleSpeed: applyAnimation ? 0.05 : 0
      };
      
      const layer = createLayerFromSVG(svgData, file.name, layerOptions);
      layers.push(layer);
      
    } catch (error) {
      console.error(`Error importing ${file.name}:`, error);
      errors.push({ file: file.name, error: error.message });
    }
  }
  
  return { layers, errors };
}
