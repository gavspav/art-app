# Legacy Disabled Index

This file tracks modules that were intentionally **commented out** (not deleted) during cleanup.

## Policy
- Code is retained as commented legacy for auditability.
- Each file exports a minimal compatibility stub where needed.
- If a legacy path is needed again, restore from file-local commented implementation.

## Active-File Legacy Blocks
- `src/components/Controls.jsx`
  - `MidiPositionSection` legacy stub block commented out.
  - `handleImageUpload` legacy block commented out.
- `src/components/global/GlobalControls.jsx`
  - Unused `BPMEnvelopeEditor` / `DEFAULT_ENVELOPE` import commented.
  - Unused direct `RangeMappingEditor` import commented.

## Disabled Legacy Modules

### Components
- `src/components/CanvasOverlayControls.jsx`
  - Reason: superseded by workspace composition and direct panel wiring.
- `src/components/ImportExportControls.jsx`
  - Reason: legacy control strip no longer wired.
- `src/components/ImportInputs.jsx`
  - Reason: legacy hidden input wrapper no longer wired.
- `src/components/LayerList.jsx`
  - Reason: layer management moved into current controls/header flows.
- `src/components/RandomizationControls.jsx`
  - Reason: randomization now integrated in current panel controls.
- `src/components/RecordingControls.jsx`
  - Reason: recording actions now exposed via current UI paths.
- `src/components/common/HoverDropdown.jsx`
  - Reason: duplicate implementation; active variant is in `Controls.jsx`.
- `src/components/global/SidebarResizer.jsx`
  - Reason: no longer imported after layout/workspace refactors.

### Hooks
- `src/hooks/useAnimationLoop.js`
  - Reason: legacy animation loop replaced by current animation path.
- `src/hooks/useFullscreenHook.js`
  - Reason: duplicate of `src/hooks/useFullscreen.js`.
- `src/hooks/useRandomizationControls.js`
  - Reason: legacy orchestration hook no longer used.
- `src/hooks/useRenderMetrics.js`
  - Reason: optional dev profiler hook not in use.
- `src/hooks/useSeededRandom.js`
  - Reason: direct utility usage replaced hook path.

### Utils / Constants
- `src/utils/fullscreen.js`
  - Reason: replaced by hook-based fullscreen flow.
- `src/utils/pixelRatio.js`
  - Reason: no current imports.
- `src/utils/videoExport.js`
  - Reason: no current imports.
- `src/constants/parameters.js`
  - Reason: duplicate catalog; active source is `src/config/parameters.js`.

## Validation Status
After disabling/commenting legacy paths:
- `npm run lint` passed
- `npm run build` passed
- `npm test` passed

## Safe Removal Checklist (Future)
Before hard deletion of any file above:
1. Confirm no imports via static search.
2. Confirm no dynamic runtime lookup path depends on it.
3. Run `npm run lint && npm run build && npm test`.
4. Run a quick manual UI smoke pass.
