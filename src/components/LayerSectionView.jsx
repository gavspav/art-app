import React, { useEffect, useRef } from 'react';
import Controls from './Controls.jsx';

/**
 * LayerSectionView
 * - Wrapper around Controls that selects an internal tab via imperative handle
 * - Optionally hides the internal tabbar for a cleaner single-section view
 */
export default function LayerSectionView({
  visibleSection = 'layer',
  hideTabbar = false,
  showMidi,
  showAudio,
  showBPM,
  // Passthrough props for Controls
  ...controlProps
}) {
  const ctrlRef = useRef(null);

  useEffect(() => {
    // Map external section ids to Controls internal tab names
    const map = {
      shape: 'Shape',
      animation: 'Animation',
      colour: 'Colors',
    };
    const tabName = map[visibleSection];
    if (tabName && ctrlRef.current && typeof ctrlRef.current.openTab === 'function') {
      ctrlRef.current.openTab(tabName);
    }
  }, [visibleSection]);

  return (
    <div className={hideTabbar ? 'no-tabbar' : undefined}>
      <Controls ref={ctrlRef} showMidi={showMidi} showAudio={showAudio} showBPM={showBPM} {...controlProps} />
    </div>
  );
}
