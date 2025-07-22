import React, { useState, memo, useCallback, useMemo } from 'react';
import ParameterControl from './ParameterControl.jsx';
import ColorPalette from './ColorPalette.jsx';
import { PARAMETERS } from '../../constants/parameters.js';
import styles from './Controls.module.css';

/**
 * Main control panel component
 * Organizes and displays all parameter controls
 */
const ControlPanel = memo(({ 
  values, 
  onChange, 
  onRandomize, 
  colors, 
  onColorsChange,
  selectedPalette,
  onPaletteChange 
}) => {
  const [activeGroup, setActiveGroup] = useState('Animation');
  const [showColorPalette, setShowColorPalette] = useState(false);

  // Memoize grouped parameters to avoid recalculation on every render
  const groupedParameters = useMemo(() => {
    return PARAMETERS.reduce((groups, param) => {
      const group = param.group || 'Other';
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(param);
      return groups;
    }, {});
  }, []);

  // Memoize randomization logic to avoid recreation on every render
  const generateRandomValue = useCallback((param) => {
    switch (param.type) {
      case 'slider':
      case 'number':
        const range = param.max - param.min;
        return param.min + Math.random() * range;
      case 'dropdown':
        const randomIndex = Math.floor(Math.random() * param.options.length);
        return param.options[randomIndex];
      case 'color':
        return `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`;
      default:
        return param.defaultValue;
    }
  }, []);

  const handleRandomizeAll = useCallback(() => {
    const randomValues = {};
    PARAMETERS.forEach(param => {
      if (param.isRandomizable) {
        randomValues[param.id] = generateRandomValue(param);
      }
    });
    onRandomize(randomValues);
  }, [onRandomize, generateRandomValue]);

  const handleRandomizeGroup = useCallback((groupName) => {
    const randomValues = {};
    groupedParameters[groupName].forEach(param => {
      if (param.isRandomizable) {
        randomValues[param.id] = generateRandomValue(param);
      }
    });
    onRandomize(randomValues);
  }, [groupedParameters, onRandomize, generateRandomValue]);

  const handleToggleColorPalette = useCallback(() => {
    setShowColorPalette(prev => !prev);
  }, []);

  return (
    <div className={styles.controlPanel}>
      <div className={styles.controlHeader}>
        <h3 className={styles.controlTitle}>Controls</h3>
        <div className={styles.headerButtons}>
          <button
            onClick={handleToggleColorPalette}
            className={`${styles.toggleButton} ${showColorPalette ? styles.active : ''}`}
          >
            Colors
          </button>
          <button
            onClick={handleRandomizeAll}
            className={styles.randomizeButton}
          >
            Randomize All
          </button>
        </div>
      </div>

      {showColorPalette && (
        <div className={styles.colorSection}>
          <ColorPalette
            selectedColors={colors}
            onColorsChange={onColorsChange}
            selectedPalette={selectedPalette}
            onPaletteChange={onPaletteChange}
          />
        </div>
      )}

      <div className={styles.parameterGroups}>
        <div className={styles.groupTabs}>
          {Object.keys(groupedParameters).map(groupName => (
            <button
              key={groupName}
              onClick={() => setActiveGroup(groupName)}
              className={`${styles.groupTab} ${activeGroup === groupName ? styles.activeTab : ''}`}
            >
              {groupName}
            </button>
          ))}
        </div>

        <div className={styles.groupContent}>
          <div className={styles.groupHeader}>
            <h4 className={styles.groupTitle}>{activeGroup}</h4>
            <button
              onClick={() => handleRandomizeGroup(activeGroup)}
              className={styles.randomizeGroupButton}
            >
              Randomize {activeGroup}
            </button>
          </div>

          <div className={styles.parameterList}>
            {groupedParameters[activeGroup]?.map(parameter => (
              <ParameterControl
                key={parameter.id}
                parameter={parameter}
                value={values[parameter.id] ?? parameter.defaultValue}
                onChange={onChange}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

ControlPanel.displayName = 'ControlPanel';

export default ControlPanel;