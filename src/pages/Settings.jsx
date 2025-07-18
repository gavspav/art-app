import React from 'react';
import { Link } from 'react-router-dom';
import { useParameters } from '../context/ParameterContext.jsx';
import './Settings.css';

const Settings = () => {
  const { parameters, updateParameter } = useParameters();

  const handleParamChange = (id, field, value) => {
    updateParameter(id, field, value);
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
      <h1>Parameter Configuration</h1>
      <Link to="/">Back to Canvas</Link>

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
                    checked={param.isRandomizable} 
                    onChange={(e) => handleParamChange(param.id, 'isRandomizable', e.target.checked)}
                  />
                  Randomizable
                </label>
                <label>
                  <input 
                    type="checkbox" 
                    checked={param.showInOverlay} 
                    onChange={(e) => handleParamChange(param.id, 'showInOverlay', e.target.checked)}
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
