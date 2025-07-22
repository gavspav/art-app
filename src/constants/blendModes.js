/**
 * Available blend modes for canvas rendering
 * These correspond to the HTML5 Canvas globalCompositeOperation values
 */

export const blendModes = [
  'source-over',
  'multiply', 
  'screen',
  'overlay',
  'lighter',
  'soft-light',
  'hard-light',
  'color-dodge'
];

export const blendModeLabels = {
  'source-over': 'Normal',
  'multiply': 'Multiply',
  'screen': 'Screen', 
  'overlay': 'Overlay',
  'lighter': 'Lighter',
  'soft-light': 'Soft Light',
  'hard-light': 'Hard Light',
  'color-dodge': 'Color Dodge'
};