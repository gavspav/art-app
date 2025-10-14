# Mobile Art App

A cross-platform generative art application that works on both mobile and desktop.

## Platform Detection

The app automatically detects whether you're on a desktop or mobile device:

- **Mobile Mode**: Touch-based shape manipulation with pinch-to-zoom and drag gestures
- **Desktop Mode**: Mouse-based node editing with individual vertex control

## Features

### Mobile (Touch Devices)
- Touch and drag shapes to deform them
- Pinch to scale shapes
- Multi-layer support with per-layer shape variations
- Simple color pickers for background and foreground

### Desktop (Mouse & Keyboard)
- **Node Editing Mode**: Click "Edit Nodes" button to enable precise vertex manipulation
- Drag individual nodes to reshape polygons
- Visual feedback with hover states and color-coded handles
- All mobile features also available via pointer events

## Controls

- **Reset**: Return to default shape
- **Randomize**: Generate random shape parameters (also triggered by shaking your phone!)
- **Print**: Order high-quality prints via Gelato print-on-demand
- **Edit Nodes** (Desktop only): Toggle node editing mode
- **Controls**: Open/close the settings drawer

### Settings Drawer
- Size, Sides, Position/Shape/Color variation sliders
- Layer count control
- Background and foreground color pickers

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

## Print-on-Demand Integration

This app includes Gelato print-on-demand integration for ordering high-quality prints of your artwork.

### Quick Start
See **[QUICK_START.md](./QUICK_START.md)** for 5-minute setup guide.

### Features
- High-resolution export (300 DPI) for print quality
- Multiple print sizes: 12x16", 18x24", 24x36", 30x40"
- Secure backend proxy (API key never exposed to client)
- Order tracking and confirmation
- Mobile-responsive print dialog

### Setup Required
1. Obtain Gelato API key from https://gelato.com/en-US/contact/
2. Configure backend with API key (see `backend/.env.example`)
3. Start backend server: `cd backend && npm run dev`
4. Configure frontend (see `.env.example`)
5. Test the integration!

For complete setup instructions, see **[SETUP_GELATO.md](./SETUP_GELATO.md)**.

## Build Tooling
- Packaged as an independent Vite + React project under `mobile_app/` with its own `package.json`.
- Uses modern ECMAScript modules and Tailwind-free lightweight CSS modules to keep bundle size small.
- Backend proxy service (Express) handles Gelato API integration securely.
- Future enhancements (e.g., PWA support, offline capability) can be layered without impacting the desktop app.
