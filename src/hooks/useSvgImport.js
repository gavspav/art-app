import { useCallback } from 'react';
import { importSVGFiles } from '../utils/svgImportEnhanced';

export function useSvgImport({
  svgFileInputRef,
  layersRef,
  selectedLayerIndex,
  setLayers,
  setSelectedLayerIndex,
  handleSetNodeEditMode,
  importBaseRef,
  importRawRef,
  importFitEnabled,
  setImportAdjust,
  setImportFitEnabled,
  setImportDebug,
  setShowImportAdjust,
  defaultLayer,
}) {
  const handleImportSVGClick = () => {
    svgFileInputRef.current?.click();
  };

  const handleImportSVGFile = useCallback(async (e) => {
    const fileList = Array.from(e.target.files || []);
    if (!fileList.length) return;

    try {
      const layersSnapshot = layersRef.current || [];
      // Use enhanced SVG import
      const { layers: newLayers, errors } = await importSVGFiles(fileList, {
        targetScale: 0.4,  // Sensible default scale (40% of canvas)
        // Preserve original relative positions for multi-file imports
        distributePositions: false,
        applyAnimation: false,  // Let user apply animation after import
        extractColors: true  // Extract and apply colors from SVG
      });
      
      // Report any errors
      if (errors.length > 0) {
        console.warn('SVG import errors:', errors);
        if (errors.length === fileList.length) {
          alert('Failed to import any SVG files. Check console for details.');
          return;
        } else if (errors.length > 0) {
          alert(`Imported ${newLayers.length} of ${fileList.length} files. Some files had errors.`);
        }
      }
      
      if (newLayers.length === 0) {
        alert('No valid SVG shapes found in the selected files.');
        return;
      }
      
      // Apply current layer parameters to imported layers if desired
      const applyCurrentParams = fileList.length === 1 && layersSnapshot.length > 0;
      if (applyCurrentParams) {
        const currentLayer = layersSnapshot[selectedLayerIndex] || layersSnapshot[0];
        newLayers.forEach(layer => {
          // Apply animation parameters from current layer
          layer.movementStyle = currentLayer.movementStyle || 'drift';
          layer.movementSpeed = currentLayer.movementSpeed || 1;
          layer.movementAngle = currentLayer.movementAngle || 45;
          layer.scaleSpeed = currentLayer.scaleSpeed || 0.05;
          layer.scaleMin = currentLayer.scaleMin || 0.2;
          layer.scaleMax = currentLayer.scaleMax || 1.5;
          
          // Apply blend mode and opacity
          layer.blendMode = currentLayer.blendMode || 'normal';
          layer.opacity = currentLayer.opacity || 100;
          
          // Apply image effects if desired
          layer.imageBlur = currentLayer.imageBlur || 0;
          layer.imageBrightness = currentLayer.imageBrightness || 100;
          layer.imageContrast = currentLayer.imageContrast || 100;
          layer.imageHue = currentLayer.imageHue || 0;
          layer.imageSaturation = currentLayer.imageSaturation || 100;
          
          // If no colors were extracted, use current layer colors
          if (!layer.colors || layer.colors.length === 0) {
            layer.colors = currentLayer.colors || defaultLayer.colors;
            layer.numColors = currentLayer.numColors || defaultLayer.numColors;
          }
        });
      }
      
      // Store RAW baseline for adjustment panel
      importRawRef.current = newLayers.map(l => ({
        x: Number(l?.position?.x) || 0.5,
        y: Number(l?.position?.y) || 0.5,
        s: Number(l?.position?.scale) || 1,
      }));
      
      // For multiple files, show import adjust panel
      if (newLayers.length > 1) {
        const margin = 0.02; // 2% margins
        const layersMeta = newLayers.map(l => {
          const nodes = Array.isArray(l.nodes) ? l.nodes : [];
          const subpaths = Array.isArray(l.subpaths) ? l.subpaths : [];
          const allNodes = subpaths.length > 0 ? subpaths.flat() : nodes;
          const s = Number(l.position?.scale) || 1;
          let maxAbsX = 0, maxAbsY = 0;
          allNodes.forEach(n => { const ax = Math.abs(n.x) || 0; const ay = Math.abs(n.y) || 0; if (ax > maxAbsX) maxAbsX = ax; if (ay > maxAbsY) maxAbsY = ay; });
          const px = Number(l.position?.x) || 0.5;
          const py = Number(l.position?.y) || 0.5;
          return { px, py, s, maxAbsX, maxAbsY };
        });
        
        // Check if auto-fit is needed
        if (importFitEnabled && !window.__artapp_disable_import_fit) {
          // Current overall bounds in [0..1] fractions
          const bounds = layersMeta.reduce((acc, m) => {
            const halfW = (m.maxAbsX || 1) * 0.5 * m.s;
            const halfH = (m.maxAbsY || 1) * 0.5 * m.s;
            const minX = m.px - halfW; const maxX = m.px + halfW;
            const minY = m.py - halfH; const maxY = m.py + halfH;
            if (minX < acc.minX) acc.minX = minX;
            if (maxX > acc.maxX) acc.maxX = maxX;
            if (minY < acc.minY) acc.minY = minY;
            if (maxY > acc.maxY) acc.maxY = maxY;
            return acc;
          }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
          
          const widthFrac = Math.max(0.0001, bounds.maxX - bounds.minX);
          const heightFrac = Math.max(0.0001, bounds.maxY - bounds.minY);
          const fitX = (1 - 2 * margin) / widthFrac;
          const fitY = (1 - 2 * margin) / heightFrac;
          const sFit = Math.min(1, fitX, fitY); // only shrink to fit; don't upscale
          
          if (sFit < 1) {
            newLayers.forEach(l => { l.position.scale = (Number(l.position.scale) || 1) * sFit; });
          }
        }
        
        // Store base positions/scales for interactive adjustment
        importBaseRef.current = importRawRef.current.map(b => ({ ...b }));
        setImportAdjust({ dx: 0, dy: 0, s: 1 });
        setImportFitEnabled(true);
        setImportDebug(false);
        setShowImportAdjust(true);
      } else {
        importBaseRef.current = [];
        setShowImportAdjust(false);
      }
      
      // Always append imported layers to existing ones
      setLayers(prev => [...prev, ...newLayers]);

      // Select the first of the newly added layers
      setSelectedLayerIndex(layersSnapshot.length);
      handleSetNodeEditMode(true, { selectedIndex: layersSnapshot.length });
      
      // Success log
      console.log(`Successfully imported ${newLayers.length} SVG layer(s) and appended to ${layersSnapshot.length} existing layer(s)`);
    } catch (err) {
      console.warn('Failed to import SVG', err);
      alert('Failed to import SVG');
    } finally {
      e.target.value = '';
    }
  }, [
    importBaseRef,
    importFitEnabled,
    importRawRef,
    selectedLayerIndex,
    setImportAdjust,
    setImportDebug,
    setImportFitEnabled,
    handleSetNodeEditMode,
    setLayers,
    setSelectedLayerIndex,
    setShowImportAdjust,
    defaultLayer,
    layersRef,
  ]);

  return {
    handleImportSVGClick,
    handleImportSVGFile,
  };
}
