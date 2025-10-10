# Mobile Art App (Touch Edition)

## Overview
The mobile edition is a streamlined, touch-first React application that focuses on direct manipulation of the base layer shape. It supports node-based editing, a small set of parameter sliders, and lightweight layer variation controls ideal for phone screens.

## Feature Scope
- **Base Layer Node Editing**: Drag nodes on the primary shape using touch or mouse pointer events.
- **Shape Controls**: Size, scale, and curviness sliders that update the base layer in real time.
- **Layer Variations**: Adjustable layer count and variation intensity to generate offset copies of the base shape.
- **Hideable UI**: A bottom sheet controls drawer that can be collapsed to maximize the canvas area.

## Core Modules
- **`src/App.jsx`**: Assembles the layout with a full-height canvas, header actions, and the collapsible controls drawer.
- **`src/state/useMobileArtState.js`**: Centralized reducer store that manages nodes, shape parameters, and derived layers.
- **`src/components/TouchCanvas.jsx`**: Renders the main SVG artboard and handles pointer interactions for node dragging.
- **`src/components/ControlsDrawer.jsx`**: Displays touch-friendly sliders and palette buttons inside a hideable bottom sheet.
- **`src/components/HeaderBar.jsx`**: Provides quick actions (e.g., show/hide controls, randomize).
- **`src/utils/shapeMath.js`**: Shared helpers for generating smooth paths, computing layer offsets, and clamping node coordinates.

## Interaction Model
- Nodes are stored in normalized coordinates (−1 to 1) so they scale with any viewport size.
- Pointer events (`pointerdown/move/up/cancel`) are normalized to support both touch and mouse input.
- While a node is dragged, visual handles highlight the active point and lock the drawer to prevent accidental interaction.

## Layout & Responsiveness
- The app uses a single-column layout with the canvas occupying `100dvh` behind the header/footer.
- The controls drawer snaps between collapsed and expanded states; it occupies at most 45% of the viewport height when open.
- Typography and control hit areas follow a minimum 44px touch target guideline.

## Build Tooling
- Packaged as an independent Vite + React project under `mobile_app/` with its own `package.json`.
- Uses modern ECMAScript modules and Tailwind-free lightweight CSS modules to keep bundle size small.
- Future enhancements (e.g., PWA support, offline capability) can be layered without impacting the desktop app.
