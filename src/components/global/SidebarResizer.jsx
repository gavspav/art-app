import React from 'react';

const SidebarResizer = ({ onStartResize }) => (
  <div className="sidebar-resizer" onMouseDown={onStartResize} />
);

export default SidebarResizer;

