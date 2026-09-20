import { useCallback, useEffect, useRef } from 'react';

export function useSceneSnapshots({
  canvasRef,
  configFileInputRef,
  parameters,
  getCurrentAppState,
  includeRnd,
  setIncludeRnd,
  defaultIncludeRnd,
  customPalettes,
  midiMappings,
  getAudioSnapshot,
  applyAudioSnapshot,
  getBPMSnapshot,
  applyBPMSnapshot,
  applyParametersSnapshot,
  loadAppState,
  setMappingsFromExternal,
  mergeCustomPaletteList,
  resetDocumentHistory,
}) {
  const parametersRef = useRef(parameters);
  const midiMappingsRef = useRef(midiMappings);
  useEffect(() => { parametersRef.current = parameters; }, [parameters]);
  useEffect(() => { midiMappingsRef.current = midiMappings; }, [midiMappings]);

  const downloadJson = useCallback((filename, obj) => {
    try {
      const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('Failed to export JSON', e);
    }
  }, []);

  const getExportMeta = useCallback(() => {
    const handle = canvasRef.current;
    const canvasEl = handle?.canvas || handle || null;
    const globalMeta = (typeof window !== 'undefined' && window.__artapp_canvasMeta) || {};
    let width = canvasEl?.width ?? globalMeta.width ?? (typeof window !== 'undefined' ? window.innerWidth : 0);
    let height = canvasEl?.height ?? globalMeta.height ?? (typeof window !== 'undefined' ? window.innerHeight : 0);
    width = Math.round(Number(width) || 0);
    height = Math.round(Number(height) || 0);
    return {
      version: '2.0',
      canvasWidth: width,
      canvasHeight: height,
      exportedAt: new Date().toISOString(),
    };
  }, [canvasRef]);

  const getFullAppState = useCallback(() => {
    const base = typeof getCurrentAppState === 'function' ? getCurrentAppState() : {};
    return { ...base, includeRnd };
  }, [getCurrentAppState, includeRnd]);

  const getCurrentAppStateRef = useRef(getFullAppState);
  useEffect(() => { getCurrentAppStateRef.current = getFullAppState; }, [getFullAppState]);

  const handleQuickSave = useCallback(() => {
    const baseName = (window.prompt('Enter filename for export (no extension):', 'scene') || '').trim();
    if (!baseName) return;
    const exportMeta = getExportMeta();
    const payload = {
      parameters: parametersRef.current,
      appState: getCurrentAppStateRef.current ? getCurrentAppStateRef.current() : null,
      customPalettes: Array.isArray(customPalettes) ? customPalettes : [],
      midiMappings: midiMappingsRef.current || {},
      audioConfig: getAudioSnapshot ? getAudioSnapshot() : null,
      bpmConfig: getBPMSnapshot ? getBPMSnapshot() : null,
      savedAt: new Date().toISOString(),
      version: '3.0',
      format: 'artapp-studio-project',
      exportMeta,
    };
    downloadJson(`${baseName}.json`, payload);
  }, [downloadJson, getExportMeta, getAudioSnapshot, getBPMSnapshot, customPalettes]);

  const handleImportFile = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const beforeImport = {
      parameters: parametersRef.current,
      appState: getCurrentAppStateRef.current?.(),
      midiMappings: midiMappingsRef.current,
      audioConfig: getAudioSnapshot?.(),
      bpmConfig: getBPMSnapshot?.(),
    };
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || (!Array.isArray(data.parameters) && !data.appState)) {
        throw new Error('This file does not contain an Art Studio project');
      }
      const omittedLegacyFeatures = [
        data.timelineConfig ? 'timeline' : null,
        data.appState?.layerGroups?.length ? 'layer groups' : null,
        data.appState?.morphEnabled || data.appState?.morphRoute?.length ? 'preset morphing' : null,
      ].filter(Boolean);
      if (data.parameters != null && !Array.isArray(data.parameters)) throw new Error('Project parameters are invalid');
      if (data.appState != null && typeof data.appState !== 'object') throw new Error('Project state is invalid');

      if (Array.isArray(data.parameters)) applyParametersSnapshot?.(data.parameters);
      if (data.appState) loadAppState?.(data.appState);
      if (data.appState?.includeRnd && typeof data.appState.includeRnd === 'object') {
        setIncludeRnd({ ...defaultIncludeRnd, ...data.appState.includeRnd });
      }
      if (data.midiMappings) setMappingsFromExternal?.(data.midiMappings);
      if (data.audioConfig) applyAudioSnapshot?.(data.audioConfig);
      if (data.bpmConfig) applyBPMSnapshot?.(data.bpmConfig);
      if (data.customPalettes) mergeCustomPaletteList(data.customPalettes);

      const base = file.name.replace(/\.json$/i, '') || 'imported';
      const name = base;
      let persisted = true;
      try {
        const key = `artapp-studio-v1-config-${name}`;
        localStorage.setItem(key, JSON.stringify(data));
        const list = JSON.parse(localStorage.getItem('artapp-studio-v1-config-list') || '[]');
        if (!list.includes(name)) {
          localStorage.setItem('artapp-studio-v1-config-list', JSON.stringify([...list, name]));
        }
      } catch (storageError) {
        console.warn('[Import] Failed to persist config to localStorage; proceeding without saving', storageError);
        persisted = false;
      }
      if (data.exportMeta && typeof window !== 'undefined') {
        window.__artapp_lastImportMeta = data.exportMeta;
      }
      alert(`Imported '${name}'${persisted ? '' : ' (local save skipped: storage is full)'}${omittedLegacyFeatures.length ? `. Skipped retired features: ${omittedLegacyFeatures.join(', ')}.` : ''}`);
      resetDocumentHistory?.();
    } catch (err) {
      console.warn('Failed to import JSON', err);
      try {
        if (Array.isArray(beforeImport.parameters)) applyParametersSnapshot?.(beforeImport.parameters);
        if (beforeImport.appState) loadAppState?.(beforeImport.appState);
        if (beforeImport.midiMappings) setMappingsFromExternal?.(beforeImport.midiMappings);
        if (beforeImport.audioConfig) applyAudioSnapshot?.(beforeImport.audioConfig);
        if (beforeImport.bpmConfig) applyBPMSnapshot?.(beforeImport.bpmConfig);
      } catch (rollbackError) {
        console.warn('[Import] Failed to restore the previous document', rollbackError);
      }
      alert(`Failed to import project: ${err?.message || 'invalid file'}`);
    } finally {
      e.target.value = '';
    }
  }, [applyParametersSnapshot, loadAppState, setMappingsFromExternal, applyAudioSnapshot, applyBPMSnapshot, mergeCustomPaletteList, resetDocumentHistory, setIncludeRnd, defaultIncludeRnd, getAudioSnapshot, getBPMSnapshot]);

  const handleQuickLoad = useCallback(() => {
    configFileInputRef.current?.click();
  }, [configFileInputRef]);

  return {
    getFullAppState,
    handleQuickSave,
    handleQuickLoad,
    handleImportFile,
  };
}
