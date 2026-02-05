import React from 'react';
import FullscreenWorkspace from './FullscreenWorkspace.jsx';
import FreeWorkspace from './FreeWorkspace.jsx';
import TimelineWorkspace from './TimelineWorkspace.jsx';

const WorkspaceRouter = ({
  isFullscreen,
  timelineMode,
  timelineVisible,
  fullscreenWorkspaceProps,
  freeWorkspaceProps,
  timelineWorkspaceProps,
}) => {
  if (isFullscreen) {
    return <FullscreenWorkspace {...fullscreenWorkspaceProps} />;
  }

  if (!timelineMode) {
    return <FreeWorkspace {...freeWorkspaceProps} />;
  }

  if (timelineVisible) {
    return <TimelineWorkspace {...timelineWorkspaceProps} />;
  }

  return null;
};

export default WorkspaceRouter;
