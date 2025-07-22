import React, { useRef, useEffect, useState } from 'react';

const SimpleCanvasTest = () => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [logs, setLogs] = useState([]);

  const addLog = (message) => {
    console.log(message);
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  useEffect(() => {
    addLog('SimpleCanvasTest: Component mounted');
    
    const testCanvas = () => {
      addLog('Testing canvas...');
      
      const canvas = canvasRef.current;
      const container = containerRef.current;
      
      addLog(`Canvas exists: ${!!canvas}`);
      addLog(`Container exists: ${!!container}`);
      
      if (container) {
        const rect = container.getBoundingClientRect();
        addLog(`Container rect: ${rect.width}x${rect.height}`);
        addLog(`Container has size: ${rect.width > 0 && rect.height > 0}`);
        
        const computedStyle = window.getComputedStyle(container);
        addLog(`Container computed width: ${computedStyle.width}`);
        addLog(`Container computed height: ${computedStyle.height}`);
        addLog(`Container display: ${computedStyle.display}`);
        addLog(`Container flex: ${computedStyle.flex}`);
      }
      
      if (canvas && container) {
        const rect = container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          try {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              canvas.width = rect.width;
              canvas.height = rect.height;
              canvas.style.width = `${rect.width}px`;
              canvas.style.height = `${rect.height}px`;
              
              // Draw test pattern
              ctx.fillStyle = '#ff0000';
              ctx.fillRect(10, 10, 100, 50);
              ctx.fillStyle = '#ffffff';
              ctx.font = '16px Arial';
              ctx.fillText('Canvas Working!', 20, 35);
              
              addLog('✅ Canvas initialized and drawing successful!');
              return true;
            } else {
              addLog('❌ Failed to get canvas context');
            }
          } catch (error) {
            addLog(`❌ Canvas error: ${error.message}`);
          }
        } else {
          addLog('❌ Container has zero dimensions');
        }
      }
      return false;
    };
    
    // Test multiple times with delays
    const delays = [0, 10, 50, 100, 250, 500, 1000];
    delays.forEach(delay => {
      setTimeout(() => {
        if (!testCanvas()) {
          addLog(`Retry after ${delay}ms failed`);
        }
      }, delay);
    });
    
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <h2>Simple Canvas Test</h2>
      
      <div 
        ref={containerRef}
        style={{ 
          width: '600px', 
          height: '400px', 
          border: '2px solid red',
          backgroundColor: '#f0f0f0',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <canvas 
          ref={canvasRef}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            backgroundColor: '#000'
          }}
        />
      </div>
      
      <div style={{ marginTop: '20px', maxHeight: '200px', overflow: 'auto' }}>
        <h3>Debug Log:</h3>
        {logs.map((log, index) => (
          <div key={index} style={{ 
            fontFamily: 'monospace', 
            fontSize: '12px',
            padding: '2px 0',
            color: log.includes('✅') ? 'green' : log.includes('❌') ? 'red' : 'black'
          }}>
            {log}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SimpleCanvasTest;