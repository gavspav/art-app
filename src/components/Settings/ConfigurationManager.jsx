/**
 * ConfigurationManager Component
 * Provides interface for saving, loading, and managing configurations
 */

import React, { useState, useCallback, useEffect, memo } from 'react';
import useConfiguration from '../../hooks/useConfiguration.js';
import styles from './Settings.module.css';

const ConfigurationManager = memo(({ 
  parameters, 
  values, 
  onConfigurationLoad,
  onMessage 
}) => {
  const {
    savedConfigs,
    save,
    load,
    delete: deleteConfig,
    export: exportConfig,
    import: importConfig,
    message,
    isLoading,
    refreshConfigList,
    clearMessage
  } = useConfiguration();

  const [saveFileName, setSaveFileName] = useState('');
  const [importData, setImportData] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [showImportForm, setShowImportForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Forward messages to parent component
  useEffect(() => {
    if (message && onMessage) {
      onMessage(message);
    }
  }, [message, onMessage]);

  // Handle save configuration
  const handleSave = useCallback(async () => {
    if (!saveFileName.trim()) {
      onMessage?.('Please enter a configuration name');
      return;
    }

    const appState = values;
    const result = await save(saveFileName.trim(), parameters, appState);
    
    if (result.success) {
      setSaveFileName('');
    }
  }, [saveFileName, parameters, values, save, onMessage]);

  // Handle load configuration
  const handleLoad = useCallback(async (configName) => {
    const result = await load(configName);
    
    if (result.success && result.data) {
      // Pass the loaded configuration to parent
      if (onConfigurationLoad) {
        onConfigurationLoad(result.data);
      }
    }
  }, [load, onConfigurationLoad]);

  // Handle delete configuration
  const handleDelete = useCallback(async (configName) => {
    if (confirmDelete === configName) {
      await deleteConfig(configName);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(configName);
      // Auto-cancel confirmation after 3 seconds
      setTimeout(() => {
        setConfirmDelete(null);
      }, 3000);
    }
  }, [deleteConfig, confirmDelete]);

  // Handle export configuration
  const handleExport = useCallback(async (configName) => {
    const result = await exportConfig(configName);
    
    if (result.success && result.data) {
      // Create and download file
      const blob = new Blob([result.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${configName}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, [exportConfig]);

  // Handle import configuration
  const handleImport = useCallback(async () => {
    if (!importFileName.trim() || !importData.trim()) {
      onMessage?.('Please provide both filename and configuration data');
      return;
    }

    const result = await importConfig(importFileName.trim(), importData.trim());
    
    if (result.success) {
      setImportFileName('');
      setImportData('');
      setShowImportForm(false);
    }
  }, [importFileName, importData, importConfig, onMessage]);

  // Handle file upload for import
  const handleFileUpload = useCallback((event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImportData(e.target.result);
        if (!importFileName) {
          // Set filename from uploaded file (without extension)
          const name = file.name.replace(/\.[^/.]+$/, '');
          setImportFileName(name);
        }
      };
      reader.readAsText(file);
    }
  }, [importFileName]);

  // Format date for display
  const formatDate = useCallback((dateString) => {
    if (!dateString) return 'Unknown';
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return 'Invalid date';
    }
  }, []);

  return (
    <div className={styles.configManager}>
      {/* Save Configuration */}
      <div className={styles.configSection}>
        <h3 className={styles.sectionTitle}>Save Configuration</h3>
        <div className={styles.configForm}>
          <div className={styles.formRow}>
            <input
              type="text"
              value={saveFileName}
              onChange={(e) => setSaveFileName(e.target.value)}
              placeholder="Enter configuration name..."
              className={styles.configInput}
              onKeyPress={(e) => e.key === 'Enter' && handleSave()}
            />
            <button
              onClick={handleSave}
              disabled={isLoading || !saveFileName.trim()}
              className={styles.actionButton}
            >
              {isLoading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Saved Configurations */}
      <div className={styles.configSection}>
        <h3 className={styles.sectionTitle}>
          Saved Configurations
          <button
            onClick={refreshConfigList}
            className={`${styles.actionButton} ${styles.secondary}`}
            style={{ marginLeft: '10px', fontSize: '0.8rem', padding: '4px 8px' }}
          >
            ↻ Refresh
          </button>
        </h3>
        
        {isLoading ? (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            Loading configurations...
          </div>
        ) : savedConfigs.length === 0 ? (
          <div className={styles.emptyState}>
            <h4>No saved configurations</h4>
            <p>Save your first configuration using the form above.</p>
          </div>
        ) : (
          <div className={styles.configList}>
            {savedConfigs.map((config) => (
              <div key={config.name} className={styles.configItem}>
                <div className={styles.configInfo}>
                  <h4 className={styles.configName}>{config.name}</h4>
                  <p className={styles.configMeta}>
                    Saved: {formatDate(config.savedAt)}
                    {config.version && ` • Version: ${config.version}`}
                  </p>
                </div>
                <div className={styles.configActions}>
                  <button
                    onClick={() => handleLoad(config.name)}
                    className={styles.actionButton}
                    disabled={isLoading}
                  >
                    Load
                  </button>
                  <button
                    onClick={() => handleExport(config.name)}
                    className={`${styles.actionButton} ${styles.secondary}`}
                    disabled={isLoading}
                  >
                    Export
                  </button>
                  <button
                    onClick={() => handleDelete(config.name)}
                    className={`${styles.actionButton} ${
                      confirmDelete === config.name ? styles.danger : styles.secondary
                    }`}
                    disabled={isLoading}
                  >
                    {confirmDelete === config.name ? 'Confirm?' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Import Configuration */}
      <div className={styles.configSection}>
        <h3 className={styles.sectionTitle}>
          Import Configuration
          <button
            onClick={() => setShowImportForm(!showImportForm)}
            className={`${styles.actionButton} ${styles.secondary}`}
            style={{ marginLeft: '10px', fontSize: '0.8rem', padding: '4px 8px' }}
          >
            {showImportForm ? 'Hide' : 'Show'}
          </button>
        </h3>
        
        {showImportForm && (
          <div className={styles.configForm}>
            <div className={styles.formRow}>
              <input
                type="text"
                value={importFileName}
                onChange={(e) => setImportFileName(e.target.value)}
                placeholder="Configuration name..."
                className={styles.configInput}
              />
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className={styles.configInput}
              />
            </div>
            <textarea
              value={importData}
              onChange={(e) => setImportData(e.target.value)}
              placeholder="Paste configuration JSON data here..."
              className={styles.configInput}
              rows={6}
              style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '0.8rem' }}
            />
            <div className={styles.formRow}>
              <button
                onClick={handleImport}
                disabled={isLoading || !importFileName.trim() || !importData.trim()}
                className={styles.actionButton}
              >
                {isLoading ? 'Importing...' : 'Import'}
              </button>
              <button
                onClick={() => {
                  setImportFileName('');
                  setImportData('');
                  setShowImportForm(false);
                }}
                className={`${styles.actionButton} ${styles.secondary}`}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

ConfigurationManager.displayName = 'ConfigurationManager';

export default ConfigurationManager;