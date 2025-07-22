import React, { useRef, useEffect, useState } from 'react';

const CanvasDebug = () => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [debugInfo, setDebugInfo] = useState([]);

  const addDebugInfo = (message) => {
    console.log(message);
    setDebugInfo(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  useEffect(() => {
    addDebugInfo('CanvasDebug: Component mounted');
    
    const testCanvas = () => {
      addDebugInfo('CanvasDebug: Testing canvas initialization...');
      
      const canvas = canvasRef.current;
      const container = containerRef.current;
      
      addDebugInfo(`Canvas ref: ${!!canvas}`);
      addDebugInfo(`Container ref: ${!!container}`);
      
      if (container) {
        const rect = container.getBoundingClientRect();
        addDebugInfo(`Container dimensions: ${rect.width}x${rect.height}`);
        addDebugInfo(`Container has size: ${rect.width > 0 && rect.height > 0}`);
        
        // Check computed styles
        const computedStyle = window.getComputedStyle(container);
        addDebugInfo(`Container computed width: ${computedStyle.width}`);
        addDebugInfo(`Container computed height: ${computedStyle.height}`);
        addDebugInfo(`Container display: ${computedStyle.display}`);
      }
      
      if (canvas) {
        addDebugInfo(`Canvas parent: ${canvas.parentElement ? canvas.parentElement.tagName : 'null'}`);
        
        try {
          const context = canvas.getContext('2d');
          addDebugInfo(`Canvas context: ${!!context}`);
          
          if (context && container) {
            const rect = container.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              // Try to set canvas size
              canvas.width = rect.width;
              canvas.height = rect.height;
              canvas.style.width = `${rect.width}px`;
              canvas.style.height = `${rect.height}px`;
              
              // Draw test pattern
              context.fillStyle = '#ff0000';
              context.fillRect(10, 10, 50, 50);
              context.fillStyle = '#00ff00';
              context.fillRect(70, 10, 50, 50);
              context.fillStyle = '#0000ff';
              context.fillRect(130, 10, 50, 50);
              
              addDebugInfo('Canvas drawing successful!');
            } else {
              addDebugInfo('Container has zero dimensions - this is the problem!');
            }
          }
        } catch (error) {
          addDebugInfo(`Canvas error: ${error.message}`);
        }
      }
    };
    
    // Test immediately
    testCanvas();
    
    // Test after a delay to see if container gets dimensions later
    setTimeout(testCanvas, 100);
    setTimeout(testCanvas, 500);
    setTimeout(testCanvas, 1000);
    
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <h2>Canvas Debug Component</h2>
      
      <div 
        ref={containerRef}
        style={{ 
          width: '800px', 
          height: '600px', 
          border: '2px solid #ccc',
          backgroundColor: '#f9f9f9',
          position: 'relative'
        }}
      >
        <canvas 
          ref={canvasRef}
          style={{
            width: '100%',
            height: '100%',
            display: 'block'
          }}
        />
      </div>
      
      <div style={{ marginTop: '20px', maxHeight: '300px', overflow: 'auto' }}>
        <h3>Debug Log:</h3>
        {debugInfo.map((info, index) => (
          <div key={index} style={{ 
            fontFamily: 'monospace', 
            fontSize: '12px',
            padding: '2px 0',
            borderBottom: '1px solid #eee'
          }}>
            {info}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CanvasDebug;