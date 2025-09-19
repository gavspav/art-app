import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useParameters } from '../context/ParameterContext.jsx';
import { useAppState } from '../context/AppStateContext.jsx';
import './Settings.css';

const Settings = () => {
  const { parameters, updateParameter, saveParameters, loadParameters, saveFullConfiguration, loadFullConfiguration, deleteConfiguration, getSavedConfigList, resetToDefaults } = useParameters();
  const { getCurrentAppState, loadAppState, resetAppState } = useAppState();
  const [message, setMessage] = useState('');
  const msgTimerRef = useRef(null);
  const [saveFilename, setSaveFilename] = useState('');
  const [loadFilename, setLoadFilename] = useState('');
  const [savedConfigs, setSavedConfigs] = useState([]);
  const [includeAppState, setIncludeAppState] = useState(true);
  const [loadAppStateOption, setLoadAppStateOption] = useState(true);
  const fileInputRef = React.useRef(null);

  const handleParamChange = (id, field, value) => {
    updateParameter(id, field, value);
  };

  // --- Export / Import helpers ---
  const downloadJson = (filename, obj) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportCurrent = () => {
    const filename = (saveFilename.trim() || 'current') + '.json';
    const payload = {
      parameters,
      appState: includeAppState ? getCurrentAppState() : null,
      savedAt: new Date().toISOString(),
      version: '1.1'
    };
    downloadJson(filename, payload);
    showMessage(`Exported ${filename}`);
  };

  const handleExportSelected = () => {
    const name = loadFilename || 'default';
    const key = `artapp-config-${name}`;
    const raw = localStorage.getItem(key);
    if (!raw) {
      showMessage(`No saved configuration named '${name}'`, true);
      return;
    }
    try {
      const obj = JSON.parse(raw);
      downloadJson(`${name}.json`, obj);
      showMessage(`Exported ${name}.json`);
    } catch {
      showMessage('Failed to export configuration', true);
    }
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleImportFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      // Derive a name from file, ensure uniqueness
      const baseName = file.name.replace(/\.json$/i, '') || 'imported';
      let name = baseName;
      const existing = new Set(getSavedConfigList());
      let i = 1;
      while (existing.has(name)) { name = `${baseName}-${i++}`; }

      const key = `artapp-config-${name}`;
      localStorage.setItem(key, JSON.stringify(data));
      // update list
      const list = getSavedConfigList();
      if (!list.includes(name)) {
        localStorage.setItem('artapp-config-list', JSON.stringify([...list, name]));
      }
      setSavedConfigs(getSavedConfigList());
      setLoadFilename(name);

      // Optionally load immediately
      const result = loadAppStateOption ? loadFullConfiguration(name) : loadParameters(name);
      if (result.success && loadAppStateOption && result.appState) {
        loadAppState(result.appState);
      }
      showMessage(`Imported '${name}'`, !result.success);
    } catch {
      showMessage('Failed to import JSON', true);
    } finally {
      // reset input so the same file can be picked again
      e.target.value = '';
    }
  };

  useEffect(() => {
    setSavedConfigs(getSavedConfigList());
  }, [getSavedConfigList]);

  const showMessage = (msg, isError = false) => {
    setMessage({ text: msg, isError });
    try {
      if (msgTimerRef.current) {
        clearTimeout(msgTimerRef.current);
        msgTimerRef.current = null;
      }
    } catch { /* noop */ }
    msgTimerRef.current = setTimeout(() => setMessage(''), 3000);
  };

  useEffect(() => {
    return () => {
      try {
        if (msgTimerRef.current) {
          clearTimeout(msgTimerRef.current);
          msgTimerRef.current = null;
        }
      } catch { /* noop */ }
    };
  }, []);

  const handleSave = () => {
    const filename = saveFilename.trim() || 'default';
    const appState = includeAppState ? getCurrentAppState() : null;
    const result = includeAppState ? saveFullConfiguration(filename, appState) : saveParameters(filename);
    showMessage(result.message, !result.success);
    if (result.success) {
      setSavedConfigs(getSavedConfigList());
      setSaveFilename('');
    }
  };

  const handleLoad = () => {
    const filename = loadFilename || 'default';
    const result = loadAppStateOption ? loadFullConfiguration(filename) : loadParameters(filename);
    
    if (result.success && loadAppStateOption && result.appState) {
      loadAppState(result.appState);
    }
    
    showMessage(result.message, !result.success);
  };

  const handleDelete = () => {
    if (!loadFilename) {
      showMessage('Please select a configuration to delete', true);
      return;
    }
    if (window.confirm(`Are you sure you want to delete configuration '${loadFilename}'?`)) {
      const result = deleteConfiguration(loadFilename);
      showMessage(result.message, !result.success);
      if (result.success) {
        setSavedConfigs(getSavedConfigList());
        setLoadFilename('');
      }
    }
  };

  const handleReset = () => {
    if (window.confirm('Are you sure you want to reset all parameters to their default values?')) {
      const result = resetToDefaults();
      showMessage(result.message, !result.success);
    }
  };

  const handleResetAppState = () => {
    if (window.confirm('Are you sure you want to reset the main app state (layers, background, etc.) to defaults?')) {
      resetAppState();
      showMessage('App state reset to defaults', false);
    }
  };

  const groupedParameters = parameters.reduce((acc, param) => {
    const group = param.group || 'General';
    if (!acc[group]) {
      acc[group] = [];
    }
    acc[group].push(param);
    return acc;
  }, {});

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1>Parameter Configuration</h1>
        
        <div className="config-management">
          <div className="save-section">
            <h3>Save Configuration</h3>
            <div className="input-group">
              <input 
                type="text" 
                placeholder="Enter configuration name" 
                value={saveFilename}
                onChange={(e) => setSaveFilename(e.target.value)}
                className="filename-input"
              />
              <button onClick={handleSave} className="save-btn">Save</button>
              <button onClick={handleExportCurrent} className="load-btn" title="Download current config as JSON">Export</button>
            </div>
            <div className="checkbox-group">
              <label>
                <input 
                  type="checkbox" 
                  checked={!!includeAppState}
                  onChange={(e) => setIncludeAppState(!!e.target.checked)}
                />
                Include app state (layers, background, animation settings)
              </label>
            </div>
          </div>
          
          <div className="load-section">
            <h3>Load Configuration</h3>
            <div className="input-group">
              <select 
                value={loadFilename} 
                onChange={(e) => setLoadFilename(e.target.value)}
                className="filename-select"
              >
                <option value="">Select a configuration...</option>
                {savedConfigs.map(config => (
                  <option key={config} value={config}>{config}</option>
                ))}
              </select>
              <button onClick={handleLoad} className="load-btn" disabled={!loadFilename}>Load</button>
              <button onClick={handleDelete} className="delete-btn" disabled={!loadFilename}>Delete</button>
              <button onClick={handleExportSelected} className="load-btn" disabled={!loadFilename} title="Download selected saved config as JSON">Export Selected</button>
              <button onClick={handleImportClick} className="save-btn" title="Import configuration from JSON">Import</button>
              <input ref={fileInputRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={handleImportFile} />
            </div>
            <div className="checkbox-group">
              <label>
                <input 
                  type="checkbox" 
                  checked={!!loadAppStateOption}
                  onChange={(e) => setLoadAppStateOption(!!e.target.checked)}
                />
                Load app state if available (layers, background, animation settings)
              </label>
            </div>
          </div>
        </div>
        
        <div className="settings-actions">
          <button onClick={handleReset} className="reset-btn">Reset Parameters</button>
          <button onClick={handleResetAppState} className="reset-btn">Reset App State</button>
          <Link to="/" className="back-link">Back to Canvas</Link>
        </div>
        
        {message && <div className={`message ${message.isError ? 'error' : 'success'}`}>{message.text}</div>}
      </div>

      {Object.entries(groupedParameters).map(([groupName, params]) => (
        <div key={groupName} className="parameter-group">
          <h2>{groupName}</h2>
          <div className="parameter-grid">
            {params.map(param => (
              <div key={param.id} className="parameter-card">
                <h3>{param.label}</h3>
                <label>Default:
                  <input 
                    type="number" 
                    value={param.defaultValue} 
                    onChange={(e) => handleParamChange(param.id, 'defaultValue', parseFloat(e.target.value))}
                  />
                </label>
                {param.min !== undefined && (
                  <label>Min:
                    <input 
                      type="number" 
                      value={param.min} 
                      onChange={(e) => handleParamChange(param.id, 'min', parseFloat(e.target.value))}
                    />
                  </label>
                )}
                {param.max !== undefined && (
                  <label>Max:
                    <input 
                      type="number" 
                      value={param.max} 
                      onChange={(e) => handleParamChange(param.id, 'max', parseFloat(e.target.value))}
                    />
                  </label>
                )}
                <label>
                  <input 
                    type="checkbox" 
                    checked={!!param.isRandomizable} 
                    onChange={(e) => handleParamChange(param.id, 'isRandomizable', !!e.target.checked)}
                  />
                  Randomizable
                </label>
                <label>
                  <input 
                    type="checkbox" 
                    checked={!!param.showInOverlay} 
                    onChange={(e) => handleParamChange(param.id, 'showInOverlay', !!e.target.checked)}
                  />
                  Show in Overlay
                </label>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default Settings;
