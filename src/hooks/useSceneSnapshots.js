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
  getTimelineSnapshot,
  applyTimelineSnapshot,
  getSoundscapeSnapshot,
  applySoundscapeSnapshot,
  quickPreset,
  setQuickPresetSnapshot,
  applyParametersSnapshot,
  loadAppState,
  getSavedConfigList,
  loadFullConfiguration,
  loadParameters,
  setMappingsFromExternal,
  mergeCustomPaletteList,
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
    const includeState = window.confirm('Include app state (layers, background, animation)?');
    const exportMeta = getExportMeta();
    const payload = {
      parameters: parametersRef.current,
      appState: includeState ? (getCurrentAppStateRef.current ? getCurrentAppStateRef.current() : null) : null,
      customPalettes: Array.isArray(customPalettes) ? customPalettes : [],
      midiMappings: midiMappingsRef.current || {},
      audioConfig: getAudioSnapshot ? getAudioSnapshot() : null,
      bpmConfig: getBPMSnapshot ? getBPMSnapshot() : null,
      timelineConfig: getTimelineSnapshot ? getTimelineSnapshot() : null,
      soundscapeConfig: getSoundscapeSnapshot ? getSoundscapeSnapshot() : null,
      savedAt: new Date().toISOString(),
      version: '2.2',
      exportMeta,
    };
    downloadJson(`${baseName}.json`, payload);
  }, [downloadJson, getExportMeta, getAudioSnapshot, getBPMSnapshot, getTimelineSnapshot, getSoundscapeSnapshot, customPalettes]);

  const handleRamPresetSave = useCallback(() => {
    if (typeof setQuickPresetSnapshot !== 'function') return;
    try {
      const snapshot = {
        parameters: Array.isArray(parameters) ? parameters : [],
        appState: typeof getFullAppState === 'function' ? getFullAppState() : null,
        audioConfig: getAudioSnapshot ? getAudioSnapshot() : null,
        bpmConfig: getBPMSnapshot ? getBPMSnapshot() : null,
        timelineConfig: getTimelineSnapshot ? getTimelineSnapshot() : null,
        soundscapeConfig: getSoundscapeSnapshot ? getSoundscapeSnapshot() : null,
        exportMeta: getExportMeta(),
        savedAt: new Date().toISOString(),
      };
      setQuickPresetSnapshot(snapshot);
    } catch (error) {
      console.warn('[RAM Preset] Failed to capture snapshot', error);
    }
  }, [getFullAppState, getExportMeta, parameters, setQuickPresetSnapshot, getAudioSnapshot, getBPMSnapshot, getTimelineSnapshot, getSoundscapeSnapshot]);

  const handleRamPresetRecall = useCallback(() => {
    if (!quickPreset) {
      console.info('[RAM Preset] No snapshot stored yet');
      return;
    }
    try {
      if (Array.isArray(quickPreset.parameters) && typeof applyParametersSnapshot === 'function') {
        applyParametersSnapshot(quickPreset.parameters);
      }
      if (quickPreset.appState && typeof loadAppState === 'function') {
        loadAppState(quickPreset.appState);
        if (quickPreset.appState.includeRnd && typeof quickPreset.appState.includeRnd === 'object') {
          setIncludeRnd({ ...defaultIncludeRnd, ...quickPreset.appState.includeRnd });
        }
      }
      if (quickPreset.exportMeta && typeof window !== 'undefined') {
        window.__artapp_lastImportMeta = quickPreset.exportMeta;
      }
      if (quickPreset.audioConfig && applyAudioSnapshot) {
        applyAudioSnapshot(quickPreset.audioConfig);
      }
      if (quickPreset.bpmConfig && applyBPMSnapshot) {
        applyBPMSnapshot(quickPreset.bpmConfig);
      }
      if (quickPreset.timelineConfig && applyTimelineSnapshot) {
        applyTimelineSnapshot(quickPreset.timelineConfig);
      }
      if (quickPreset.soundscapeConfig && applySoundscapeSnapshot) {
        applySoundscapeSnapshot(quickPreset.soundscapeConfig);
      }
    } catch (error) {
      console.warn('[RAM Preset] Failed to recall snapshot', error);
    }
  }, [applyParametersSnapshot, loadAppState, quickPreset, applyAudioSnapshot, applyBPMSnapshot, applyTimelineSnapshot, applySoundscapeSnapshot, setIncludeRnd, defaultIncludeRnd]);

  const handleImportFile = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data?.customPalettes) {
        mergeCustomPaletteList(data.customPalettes);
      }
      try {
        if (data && data.midiMappings && setMappingsFromExternal) setMappingsFromExternal(data.midiMappings);
      } catch { /* noop */ }

      try {
        if (data && data.audioConfig && applyAudioSnapshot) applyAudioSnapshot(data.audioConfig);
      } catch { /* noop */ }

      try {
        if (data && data.bpmConfig && applyBPMSnapshot) applyBPMSnapshot(data.bpmConfig);
      } catch { /* noop */ }

      try {
        if (data && data.timelineConfig && applyTimelineSnapshot) applyTimelineSnapshot(data.timelineConfig);
      } catch { /* noop */ }
      try {
        if (data && data.soundscapeConfig && applySoundscapeSnapshot) applySoundscapeSnapshot(data.soundscapeConfig);
      } catch { /* noop */ }

      const base = file.name.replace(/\.json$/i, '') || 'imported';
      const existing = new Set(getSavedConfigList());
      let name = base;
      let i = 1;
      while (existing.has(name)) { name = `${base}-${i++}`; }

      let persistedName = null;
      try {
        const key = `artapp-config-${name}`;
        localStorage.setItem(key, JSON.stringify(data));
        const list = getSavedConfigList();
        if (!list.includes(name)) {
          localStorage.setItem('artapp-config-list', JSON.stringify([...list, name]));
        }
        persistedName = name;
      } catch (storageError) {
        console.warn('[Import] Failed to persist config to localStorage; proceeding without saving', storageError);
      }

      const loadState = window.confirm('Load app state if available?');
      let res = null;

      if (persistedName) {
        res = loadState ? loadFullConfiguration(persistedName) : loadParameters(persistedName);
        if (res?.success && loadState && res.appState && typeof loadAppState === 'function') {
          loadAppState(res.appState);
          if (res.appState.includeRnd && typeof res.appState.includeRnd === 'object') {
            setIncludeRnd({ ...defaultIncludeRnd, ...res.appState.includeRnd });
          }
        }
      } else {
        if (loadState) {
          if (Array.isArray(data?.parameters) && typeof applyParametersSnapshot === 'function') {
            try { applyParametersSnapshot(data.parameters); } catch { /* noop */ }
          }
          if (data?.appState && typeof loadAppState === 'function') {
            try { loadAppState(data.appState); } catch { /* noop */ }
          }
        } else if (Array.isArray(data?.parameters) && typeof applyParametersSnapshot === 'function') {
          try { applyParametersSnapshot(data.parameters); } catch { /* noop */ }
        }

        res = { success: true, exportMeta: data?.exportMeta, appState: data?.appState };
      }

      const loadedAppState = res?.appState || data?.appState;
      if (loadState && loadedAppState?.includeRnd && typeof loadedAppState.includeRnd === 'object') {
        setIncludeRnd({ ...defaultIncludeRnd, ...loadedAppState.includeRnd });
      }

      if (res?.exportMeta && typeof window !== 'undefined') {
        window.__artapp_lastImportMeta = res.exportMeta;
      }

      if (persistedName) {
        alert(`Imported '${persistedName}'`);
      } else {
        alert('Imported (local save skipped: storage is full)');
      }
    } catch (err) {
      console.warn('Failed to import JSON', err);
      alert('Failed to import JSON');
    } finally {
      e.target.value = '';
    }
  }, [applyParametersSnapshot, getSavedConfigList, loadAppState, loadFullConfiguration, loadParameters, setMappingsFromExternal, applyAudioSnapshot, applyBPMSnapshot, applyTimelineSnapshot, applySoundscapeSnapshot, mergeCustomPaletteList, setIncludeRnd, defaultIncludeRnd]);

  const handleQuickLoad = useCallback(() => {
    configFileInputRef.current?.click();
  }, [configFileInputRef]);

  return {
    getFullAppState,
    handleQuickSave,
    handleQuickLoad,
    handleImportFile,
    handleRamPresetSave,
    handleRamPresetRecall,
  };
}
