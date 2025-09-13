# Refactor Guide: Make All Drawing Relative to Canvas Size

This document outlines the **full sequence of work** required to eliminate hard-coded pixel dimensions from the art-app and make every geometric, noise and motion parameter scale faithfully with the canvas.

---

## 0. High-level Goal

- [ ] Remove absolute-pixel assumptions (`width`, `height`, fixed `px` offsets).
- [ ] Introduce a dimension-less `radiusFactor` (0–1) expressing layer size as a fraction of the canvas' smaller dimension.
- [ ] Express every deformation term (noise, wobble, radiusBump) as a fraction of canvas size.

---

## 1. Data-Model Changes

 - [ ] 1.1 **Add `radiusFactor` to defaults**  
  File: `src/constants/defaults.js`  
  Default: `radiusFactor: 0.4` (matches previous 250 px on 640 px canvas).

 - [ ] 1.2 **Deprecate `width` / `height`**  
  Retain for legacy loads but ignore once migrated.

 - [ ] 1.3 **Update parameter metadata**  
  - [ ] Remove Width/Height sliders.  
  - [ ] Add `radiusFactor` slider (min 0.02, max 0.9, step 0.01).

---

## 2. Rendering Code

 - [ ] 2.1 **`drawShape` (`src/components/Canvas.jsx`)**

```js
const minWH = Math.min(canvas.width, canvas.height);
const radius = minWH * radiusFactor * scale + radiusBump * minWH * 0.02;
```
 - [ ] Drop `width/height` branches.
 - [ ] Replace noise offsets:
```js
const NOISE_BASE = minWH * 0.03; // 3 % of canvas
const offset = (n1*1 + n2*0.75 + n3*0.5) * NOISE_BASE * noiseAmount * amplitudeFactor;
```

 - [ ] 2.2 **`estimateLayerHalfExtents`** – mirror the new maths.

 - [ ] 2.3 **`computeDeformedNodePoints`** – keep in sync.

---

## 3. Randomisation Logic

 - [ ] Files: `src/hooks/useRandomization.js`, etc.
 - [ ] Replace pixel ranges (10–900) with `radiusFactor` ranges (0.05–0.45).
 - [ ] Remove `width` / `height` sampling.

---

## 4. UI Updates

 - [ ] 4.1 **Controls components** – replace Width/Height sliders with `Size` slider bound to `radiusFactor`.

 - [ ] 4.2 Update tool-tips to clarify percentage meaning.

---

## 5. Migration & Backward Compatibility

 - [ ] 5.1 **Auto-migration on load**  (`ParameterContext.loadFullConfiguration()`)
```js
if (!('radiusFactor' in layer)) {
  const avg = (layer.width + layer.height) / 2;
  const minWH = /* container */ 640; // fallback
  layer.radiusFactor = clamp(avg / (minWH * 2), 0.02, 0.9);
  delete layer.width;
  delete layer.height;
}
```

 - [ ] 5.2 Stop exporting deprecated fields.

---

## 6. Tests & Linting

 - [ ] Update unit tests referencing `width/height`.
 - [ ] Add regression: resizing canvas ±50 % preserves visuals (<1 px diff).

---

## 7. Documentation

 - [ ] Update README & in-app help to describe `Size (radius)`.
 - [ ] Document automatic migration.

---

## 8. QA Checklist

- [ ] Shapes scale correctly on resize.  
- [ ] Noise & wobble retain proportions.  
- [ ] Drift wrapping seamless.  
- [ ] Bounce hits canvas edge.  
- [ ] Legacy configs load cleanly.  
- [ ] Mobile viewport good.

---

## 9. Roll-out Plan

 - [ ] Guard behind `useRelativeDrawing` feature flag.  
 - [ ] Merge → CI → manual QA.  
 - [ ] Remove flag & tag release.

---

## 10. Effort Estimate

| Task | Hours |
| --- | --- |
| Core maths refactor | 4 |
| UI + metadata | 2 |
| Migration + tests | 2 |
| QA & polish | 2 |
| **Total** | **~1 day** |
