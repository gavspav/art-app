export default function RecordingControls({
  isRecording,
  onStartRecording,
  onStopRecording,
  variant = 'panel',
  className = '',
}) {
  const label = isRecording ? 'Stop Recording' : 'Start Recording';
  const baseClass = variant === 'fab' ? 'fab' : 'control-button';
  const activeClass = isRecording ? ' recording-active' : '';
  const buttonClass = className ? `${baseClass}${activeClass} ${className}` : `${baseClass}${activeClass}`;

  const button = (
    <button
      type="button"
      className={buttonClass}
      onClick={isRecording ? onStopRecording : onStartRecording}
      title={label}
      aria-label={label}
      aria-pressed={isRecording}
      data-recording={isRecording ? 'true' : 'false'}
    >
      {variant === 'fab' ? (isRecording ? '⏹' : '⏺') : label}
    </button>
  );

  if (variant === 'fab') {
    return button;
  }

  return (
    <div className="controls-group recording-controls">
      {button}
    </div>
  );
}
