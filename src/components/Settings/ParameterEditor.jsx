/**
 * ParameterEditor Component
 * Provides interface for editing parameter configurations and values
 */

import React, { useState, useCallback, useMemo, memo } from 'react';
import styles from './Settings.module.css';

const ParameterEditor = memo(({ 
  parameters, 
  values, 
  onParameterUpdate, 
  onValueUpdate,
  onRandomizeParameter,
  onResetParameter 
}) => {
  const [expandedGroups, setExpandedGroups] = useState(new Set(['Animation', 'Shape', 'Appearance']));

  // Toggle group expansion
  const toggleGroup = useCallback((groupName) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupName)) {
        newSet.delete(groupName);
      } else {
        newSet.add(groupName);
      }
      return newSet;
    });
  }, []);

  // Group parameters by their group property
  const parametersByGroup = React.useMemo(() => {
    const groups = {};
    parameters.forEach(parameter => {
      const group = parameter.group || 'Other';
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(parameter);
    });
    return groups;
  }, [parameters]);

  // Handle parameter value change
  const handleValueChange = useCallback((parameterId, value) => {
    if (onValueUpdate) {
      onValueUpdate(parameterId, value);
    }
  }, [onValueUpdate]);

  // Handle parameter configuration change
  const handleParameterChange = useCallback((parameterId, property, value) => {
    if (onParameterUpdate) {
      onParameterUpdate(parameterId, property, value);
    }
  }, [onParameterUpdate]);

  // Render parameter control based on type
  const renderParameterControl = useCallback((parameter) => {
    const currentValue = values[parameter.id] ?? parameter.defaultValue;

    switch (parameter.type) {
      case 'slider':
        return (
          <div className={styles.parameterControl}>
            <input
              type="range"
              min={parameter.min}
              max={parameter.max}
              step={parameter.step}
              value={currentValue}
              onChange={(e) => handleValueChange(parameter.id, parseFloat(e.target.value))}
              className={styles.parameterSlider}
            />
            <span className={styles.parameterValue}>
              {typeof currentValue === 'number' ? currentValue.toFixed(3) : currentValue}
            </span>
          </div>
        );

      case 'number':
        return (
          <div className={styles.parameterControl}>
            <input
              type="number"
              min={parameter.min}
              max={parameter.max}
              step={parameter.step}
              value={currentValue}
              onChange={(e) => handleValueChange(parameter.id, parseFloat(e.target.value))}
              className={styles.parameterInput}
            />
          </div>
        );

      case 'dropdown':
        return (
          <div className={styles.parameterControl}>
            <select
              value={currentValue}
              onChange={(e) => handleValueChange(parameter.id, e.target.value)}
              className={styles.parameterInput}
            >
              {parameter.options?.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        );

      case 'color':
        return (
          <div className={styles.parameterControl}>
            <input
              type="color"
              value={currentValue}
              onChange={(e) => handleValueChange(parameter.id, e.target.value)}
              className={styles.parameterInput}
            />
            <input
              type="text"
              value={currentValue}
              onChange={(e) => handleValueChange(parameter.id, e.target.value)}
              className={styles.parameterInput}
              placeholder="#000000"
            />
          </div>
        );

      default:
        return (
          <div className={styles.parameterControl}>
            <input
              type="text"
              value={currentValue}
              onChange={(e) => handleValueChange(parameter.id, e.target.value)}
              className={styles.parameterInput}
            />
          </div>
        );
    }
  }, [values, handleValueChange]);

  // Render parameter item
  const renderParameterItem = useCallback((parameter) => {
    return (
      <div key={parameter.id} className={styles.parameterItem}>
        <div className={styles.parameterLabel}>
          {parameter.label}
        </div>
        {renderParameterControl(parameter)}
        <div className={styles.configActions}>
          {parameter.isRandomizable && (
            <button
              onClick={() => onRandomizeParameter?.(parameter.id)}
              className={`${styles.actionButton} ${styles.secondary}`}
              title="Randomize parameter"
            >
              🎲
            </button>
          )}
          <button
            onClick={() => onResetParameter?.(parameter.id)}
            className={`${styles.actionButton} ${styles.secondary}`}
            title="Reset to default"
          >
            ↺
          </button>
        </div>
      </div>
    );
  }, [renderParameterControl, onRandomizeParameter, onResetParameter]);

  return (
    <div className={styles.parameterEditor}>
      {Object.entries(parametersByGroup).map(([groupName, groupParameters]) => (
        <div key={groupName} className={styles.parameterGroup}>
          <h3 
            className={styles.groupTitle}
            onClick={() => toggleGroup(groupName)}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            {expandedGroups.has(groupName) ? '▼' : '▶'} {groupName}
          </h3>
          {expandedGroups.has(groupName) && (
            <div className={styles.parameterList}>
              {groupParameters.map(renderParameterItem)}
            </div>
          )}
        </div>
      ))}
      
      <div className={styles.parameterGroup}>
        <h3 className={styles.groupTitle}>Actions</h3>
        <div className={styles.formRow}>
          <button
            onClick={() => {
              parameters.forEach(param => {
                if (param.isRandomizable) {
                  onRandomizeParameter?.(param.id);
                }
              });
            }}
            className={styles.actionButton}
          >
            Randomize All
          </button>
          <button
            onClick={() => {
              parameters.forEach(param => {
                onResetParameter?.(param.id);
              });
            }}
            className={`${styles.actionButton} ${styles.secondary}`}
          >
            Reset All
          </button>
        </div>
      </div>
    </div>
  );
});

ParameterEditor.displayName = 'ParameterEditor';

export default ParameterEditor;