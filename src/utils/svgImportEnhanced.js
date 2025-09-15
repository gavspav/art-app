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
    applyToLayer = {}  // Additional layer properties to apply
  } = options;

  if (!svgString || typeof svgString !== 'string') {
    throw new Error('Invalid SVG string');
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    
    if (!svgEl) {
      throw new Error('No SVG element found');
    }

    // Extract viewBox and dimensions
    const viewBox = parseViewBox(svgEl);
    const dimensions = getSVGDimensions(svgEl, viewBox);
    
    // Extract all paths and shapes
    const shapes = extractAllShapes(svgEl, dimensions);
    
    // Extract colors if requested
    const colors = extractColors ? extractSVGColors(svgEl) : [];
    
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
function extractAllShapes(svgEl, dimensions) {
  const shapes = [];
  const elements = svgEl.querySelectorAll('path, polygon, polyline, circle, ellipse, rect, line');
  
  elements.forEach((el, index) => {
    const shape = extractShape(el, dimensions);
    if (!shape || shape.points.length < 3) return;

    // Compute shape bounding box to detect full-background rectangles
    const bbox = calculateBoundingBox([{ points: shape.points }]);
    const isFullWidth = bbox.width >= 0.95 * dimensions.width;
    const isFullHeight = bbox.height >= 0.95 * dimensions.height;
    const isBackgroundRect = (shape.type === 'rect') && isFullWidth && isFullHeight;
    if (isBackgroundRect) return; // skip likely background

    shapes.push({
      ...shape,
      id: `shape_${index}`,
      originalElement: el.tagName.toLowerCase()
    });
  });
  
  return shapes;
}

/**
 * Extract points from a single shape element
 */
function extractShape(element, dimensions) {
  const tag = element.tagName.toLowerCase();
  let points = [];
  let attributes = {};
  
  // Extract common attributes
  ['fill', 'stroke', 'stroke-width', 'opacity', 'transform'].forEach(attr => {
    const value = element.getAttribute(attr);
    if (value) attributes[attr] = value;
  });
  
  switch (tag) {
    case 'path':
      points = samplePathElement(element);
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
    points = applyTransform(points, transform);
  }
  
  // Apply parent transforms
  let parent = element.parentElement;
  while (parent && parent !== element.ownerDocument.documentElement) {
    const parentTransform = parent.getAttribute('transform');
    if (parentTransform) {
      points = applyTransform(points, parentTransform);
    }
    parent = parent.parentElement;
  }
  
  return {
    type: tag,
    points,
    attributes
  };
}

/**
 * Sample points from a path element
 */
function samplePathElement(pathEl, sampleCount = 0) {
  try {
    const totalLength = pathEl.getTotalLength();
    if (!totalLength || totalLength <= 0) return [];
    
    // Adaptive sampling based on path complexity
    const count = sampleCount || Math.max(32, Math.min(256, Math.floor(totalLength / 2)));
    const points = [];
    
    for (let i = 0; i <= count; i++) {
      const point = pathEl.getPointAtLength((i / count) * totalLength);
      points.push({ x: point.x, y: point.y });
    }
    
    return points;
  } catch (error) {
    console.warn('Error sampling path:', error);
    return [];
  }
}

/**
 * Parse polygon/polyline points
 */
function parsePolygonPoints(pointsStr) {
  if (!pointsStr) return [];
  
  const numbers = pointsStr.trim().split(/[\s,]+/).map(parseFloat);
  const points = [];
  
  for (let i = 0; i < numbers.length - 1; i += 2) {
    if (Number.isFinite(numbers[i]) && Number.isFinite(numbers[i + 1])) {
      points.push({ x: numbers[i], y: numbers[i + 1] });
    }
  }
  
  return points;
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
      case 'translate':
        const tx = params[0] || 0;
        const ty = params[1] || 0;
        result = result.map(p => ({ x: p.x + tx, y: p.y + ty }));
        break;
        
      case 'scale':
        const sx = params[0] || 1;
        const sy = params[1] || sx;
        result = result.map(p => ({ x: p.x * sx, y: p.y * sy }));
        break;
        
      case 'rotate':
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
        
      case 'matrix':
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
  
  return result;
}

/**
 * Extract colors from SVG
 */
function extractSVGColors(svgEl) {
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
  
  // Remove common defaults and convert to array
  colors.delete('#000000');
  colors.delete('#ffffff');
  colors.delete('black');
  colors.delete('white');
  
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
  
  return {
    scale,
    position,
    bbox
  };
}

/**
 * Convert parsed SVG data to layer nodes format
 */
export function convertToLayerNodes(shapes, transform) {
  if (!shapes || !shapes.length) return [];
  
  // Merge all shapes into a single set of nodes
  const allPoints = [];
  const subpaths = [];
  
  shapes.forEach(shape => {
    if (shape.points && shape.points.length > 0) {
      subpaths.push(shape.points);
      allPoints.push(...shape.points);
    }
  });
  
  if (allPoints.length < 3) return [];
  
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
  
  return {
    nodes: normalizedNodes,
    subpaths: normalizedSubpaths.length > 1 ? normalizedSubpaths : null
  };
}

/**
 * Create a layer configuration from parsed SVG
 */
export function createLayerFromSVG(svgData, fileName = 'SVG Layer', options = {}) {
  const {
    nodes,
    subpaths
  } = convertToLayerNodes(svgData.shapes, svgData.transform);
  
  const layer = {
    ...DEFAULT_LAYER,
    ...options,
    name: fileName.replace(/\.[^/.]+$/, ''),
    layerType: 'shape',
    nodes: subpaths ? null : nodes,  // Use subpaths if multiple paths
    subpaths: subpaths,
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
    colors: svgData.colors.length > 0 ? svgData.colors : DEFAULT_LAYER.colors,
    numColors: svgData.colors.length > 0 ? svgData.colors.length : DEFAULT_LAYER.numColors,
    
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
