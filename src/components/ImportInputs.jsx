export default function ImportInputs({
  svgInputRef,
  configInputRef,
  onImportSVG,
  onImportConfig,
}) {
  return (
    <>
      <input
        ref={svgInputRef}
        type="file"
        accept=".svg,image/svg+xml"
        multiple
        style={{ display: 'none' }}
        onChange={onImportSVG}
      />
      <input
        ref={configInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={onImportConfig}
      />
    </>
  );
}
