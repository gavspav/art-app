# Codex 5.4 — Aesthetic & Usability Improvements Prompt

## Project Overview

This is a generative art application built with **React 19 + Vite**, using **custom CSS** (no component library). The app renders animated procedural shapes on an HTML canvas with extensive parameter controls. It has three workspace modes:

1. **Free mode** — full-screen canvas with a floating, dockable bottom control panel
2. **Timeline mode** — split view: controls panel + canvas on top, timeline editor on bottom
3. **Fullscreen mode** — canvas only, minimal UI

The control panel has 7 tabs: Global, Layer Shape, Layer Animation, Layer Colour, Audio, Presets, Groups. There is also a global toolbar bar with quick-action icon buttons (save, load, autosave, timeline toggle, MIDI, BPM beat indicator, audio indicator, LED meter, clear mappings).

---

## Current Architecture (DO NOT change structure, only improve styling/UX)

### Key Files

- **CSS**: `src/App.css` (design tokens + all component styles, ~1026 lines), `src/components/BottomPanel.css` (~701 lines), `src/index.css` (Tailwind base imports, but Tailwind is barely used — most styling is custom CSS)
- **Layout**: `src/components/workspaces/WorkspaceRouter.jsx`, `FreeWorkspace.jsx`, `TimelineWorkspace.jsx`, `FullscreenWorkspace.jsx`
- **Control Panel**: `src/components/BottomPanel.jsx` (~1544 lines) — the main control panel container with tabs, docking, resize, peek/expand states
- **Controls**: `src/components/Controls.jsx` (~2215 lines) — layer-specific controls
- **Global Controls**: `src/components/global/GlobalControls.jsx` (~1991 lines) — global parameter sliders, palette, blend mode, morph, variation sliders
- **Audio Sections**: `src/components/global/sections/GlobalAutomationSections.jsx` (~162K) — audio reactive, BPM, audio spawn, patch matrix, demo presets
- **Timeline**: `src/components/timeline/TimelinePanel.jsx`, `TimelineTransport.jsx`, `TimelineTrackRow.jsx`, `TimelineCurveEditor.jsx`, `TimelineWaveform.jsx`
- **Common**: `src/components/common/RangeSlider.jsx`, `BufferedNumberInput.jsx`, `ColorPickerPopover.jsx`, `DraggableDivider.jsx`, `HoverDropdown.jsx`, `BPMEnvelopeEditor.jsx`
- **FABs**: `src/components/global/FloatingActionButtons.jsx`

### Design Tokens (`:root` in App.css)

```css
--accent: #4fc3f7;           /* cyan */
--accent-dim: rgba(79, 195, 247, 0.15);
--accent-border: rgba(79, 195, 247, 0.3);
--accent-glow: rgba(79, 195, 247, 0.45);
--accent-secondary: #3fb950; /* green — confirm/primary */
--accent-warn: #ff7a2f;      /* orange — destructive/randomise */
--radius-sm: 6px;
--radius-md: 10px;
--radius-lg: 14px;
--z-canvas: 0; --z-card: 2; --z-panel: 100; --z-sidebar: 200; --z-divider: 250; --z-fab: 500; --z-modal: 1200;
```

---

## IDENTIFIED ISSUES — Aesthetic

### A1. Inconsistent Styling Approach
- Most styling is inline `style={{}}` objects in JSX (especially `TimelineTransport.jsx`, `GlobalControls.jsx`, `BottomPanel.jsx`). The CSS files define good classes but they're underused.
- Timeline transport buttons, timeline track headers, and many GlobalControls rows are 100% inline-styled with hard-coded colors/sizes rather than using the design token classes.
- **Fix**: Extract repeated inline styles into CSS classes in `App.css` or `BottomPanel.css`. Use the existing design tokens (`var(--accent)`, `var(--radius-sm)`, etc.) consistently.

### A2. Emoji Icons Instead of Proper Icon Set
- The entire UI uses raw emoji characters for icons: `🌍 ⬟ ▶️ 🎨 🎵 🎛️ 🧰 💾 📂 🛟 🕒 🎹 🧹 🔒 🔓 ⬇️ 🎲 ⏺ ⏹ ⤢ 🔊 ♪ ⚙` etc.
- Emojis render differently across platforms/browsers, have inconsistent sizing, and look unprofessional.
- **Fix**: Replace all emoji icons with a consistent icon library. **Lucide React** (`lucide-react`) is recommended — it's lightweight, tree-shakeable, and has matching icons for every use case in this app (Globe, Pentagon, Play, Palette, Music, Sliders, FolderOpen, Save, LifeBuoy, Clock, Piano, Trash2, Lock, Unlock, ChevronDown, Dice5, Circle, Square, Maximize2, Volume2, Settings, etc.).

### A3. Floating Action Buttons (FABs) Are Dated
- The FABs (download, randomize, fullscreen, record) use a stacked column layout with large 60px circles, emoji icons, and heavy glow shadows.
- They take up significant visual space and overlap with the canvas art.
- **Fix**: Redesign as a compact horizontal or pill-shaped toolbar that auto-fades to ~20% opacity when idle, with smaller (36-40px) buttons using Lucide icons, subtle borders, and a frosted glass background. Keep the recording pulse animation but refine it.

### A4. Color Picker Is Basic
- `ColorPickerPopover.jsx` is a custom HSV picker. It works but looks basic compared to modern UI pickers.
- **Fix**: Add a subtle gradient border, improve the thumb shadows, and add preset swatches row at the bottom showing the current palette colors. Keep the existing implementation — just style improvements.

### A5. Control Cards Need Visual Hierarchy
- `.control-card` uses a flat dark background with very subtle borders. All cards look identical regardless of content importance.
- The `<details>` elements in GlobalControls (e.g., "Settings") have minimal styling — just a bare `<summary>` with default browser disclosure triangle.
- **Fix**: Add subtle left-edge color accents to distinguish card types (e.g., cyan for global, green for layer, purple for audio). Style `<details><summary>` with custom chevron icons, hover states, and transitions.

### A6. Typography and Spacing Are Inconsistent
- Font sizes are scattered: `0.7rem`, `0.75rem`, `0.8rem`, `0.85rem`, `0.9rem`, `0.92rem`, `1rem`, `1.1rem`, `11px`, `12px`, `14px`, `18px`, `22px` — with no clear hierarchy.
- Label sizing varies wildly between sections.
- **Fix**: Establish a type scale using CSS custom properties: `--text-xs: 0.7rem`, `--text-sm: 0.8rem`, `--text-base: 0.9rem`, `--text-lg: 1rem`, `--text-xl: 1.15rem`. Apply consistently.

### A7. Timeline Transport Bar Looks Utilitarian
- `TimelineTransport.jsx` is entirely inline-styled with minimal visual design. The play/pause/stop buttons, time display, zoom controls, and audio controls all have slightly different ad-hoc styling.
- **Fix**: Give it a cohesive toolbar look — consistent button sizes, grouped controls with subtle separators, a proper monospaced time display badge, and matching the design token palette.

### A8. Timeline Track Headers Are Cramped
- Track header width is hard-coded at 200px with small selectors and buttons crammed together.
- **Fix**: Improve layout with better padding, truncation for long names, and hover-reveal actions. Consider making the track header width user-adjustable.

---

## IDENTIFIED ISSUES — Usability

### U1. Panel Discovery Is Poor
- New users may not know the control panel exists. The peek bar is a thin strip that says "Controls" in tiny uppercase text.
- The first-time experience shows a full-screen canvas with small floating buttons and a barely visible peek bar.
- **Fix**: Add a subtle onboarding tooltip or animated hint arrow on first visit (use localStorage flag). Make the peek bar slightly taller (28-32px) with a more visible drag handle indicator.

### U2. Tab Labels Disappear When Panel Is Narrow
- When `panelWidthVW <= 28`, the `.compact` class hides tab labels, leaving only emoji icons — which, per A2, are inconsistent and hard to identify.
- **Fix**: After switching to Lucide icons, add tooltips on the icon-only tab buttons. Consider adding a subtle text underline or badge for the active tab in compact mode.

### U3. Global Toolbar Icons Have No Labels or Grouping
- The global toolbar (save, load, autosave, timeline, MIDI, beat, audio, LED, clear) is a flat row of small icon buttons with no visual grouping.
- Users must hover each button to understand its function.
- **Fix**: Group related buttons with subtle separators or pill backgrounds (e.g., [Save | Load | Autosave] [Timeline | MIDI] [Beat | Audio | LED | Clear]). Add persistent micro-labels below icons when panel width allows.

### U4. Keyboard Shortcuts Overlay Is Plain
- `KeyboardShortcutsOverlay.jsx` shows a 2-column grid of shortcuts. It's functional but the `<kbd>` tags and layout could be more polished.
- **Fix**: Style with a modern modal look — rounded card, category headers (Navigation, Timeline, Audio, Editing), consistent kbd pill styling, and a search/filter input at the top.

### U5. Settings Panels Are Deeply Nested
- Each parameter (Speed, Opacity, Layers, Variation×5) has a ⚙ button that toggles an inline settings panel containing MIDI learn, Audio mapping, BPM mapping, and range controls.
- These are dense and visually undifferentiated from the parent control.
- **Fix**: Give settings panels a distinct visual treatment — slightly recessed background, left border accent, and collapsible section headers for MIDI/Audio/BPM/Range.

### U6. The "Include in Randomize" Checkboxes Are Cryptic
- Every parameter has an "Incl" checkbox (short for "Include in Randomize All"). New users won't understand what this means.
- **Fix**: Rename to "Rnd" with a dice icon, or use a small toggle switch instead of a checkbox. Add a tooltip: "Include this parameter when Randomize All is triggered".

### U7. Layer Selector in Control Panel Header Is Hard to Use
- Layer selection uses a custom `HoverDropdown` that triggers `onChange` on hover (for live preview). This is clever but can be disorienting — the scene changes just from mousing over a layer name.
- **Fix**: Add a subtle visual indicator (e.g., layer color dot, opacity flash on canvas) to show which layer is being previewed. Consider adding a "Preview" label or different background tint during hover-preview vs. committed selection.

### U8. Timeline Workspace Controls Panel Has No Visual Boundary
- In timeline mode, the controls panel sits in the top-left with `background: rgba(20, 20, 30, 0.95)` and a right border, but it blends with the canvas at the top/bottom edges.
- **Fix**: Add a subtle top/bottom border or shadow to clearly delineate the controls region from the canvas and timeline areas.

### U9. Scrollbar Styling Is Minimal
- Custom scrollbar styles exist but are very subtle (6px wide, nearly transparent). In the timeline especially, scroll position is hard to perceive.
- **Fix**: Make scrollbars slightly more visible in the timeline area. Consider adding a minimap or scroll position indicator for the timeline tracks.

### U10. Mobile/Touch Support Is Minimal
- The `@media (max-width: 768px)` responsive styles only shrink FABs and hide tab labels. The app is essentially desktop-only.
- The `DraggableDivider` only supports mouse events (no touch).
- **Fix**: Add touch event support to `DraggableDivider`. Improve the responsive breakpoint to stack the timeline below the canvas. Make the bottom panel full-width on small screens. Add touch-friendly hit targets (minimum 44px) for buttons.

### U11. No Undo/Redo Indication
- There's no visible undo/redo UI. Users making destructive changes (randomize, delete layer) have no safety net indication.
- **Fix**: Add undo/redo buttons to the global toolbar (even if the backend isn't implemented yet — at least show disabled placeholder buttons to signal future capability). For now, add a brief toast notification when destructive actions occur: "Scene randomized — press Ctrl+Z to undo" (if undo exists) or just acknowledge the action.

### U12. Audio Patch Matrix Is Information-Dense
- `GlobalAutomationSections.jsx` is 162KB — the audio patch matrix UI with trigger controls, mode settings, and demo presets is extremely dense.
- **Fix**: Organize into collapsible accordion sections. Add visual "active" states for enabled mappings (color-coded rows). Add a summary view showing how many mappings are active before expanding.

---

## IMPLEMENTATION GUIDELINES

1. **Install `lucide-react`** as a dependency. Replace ALL emoji icons across the codebase with Lucide components. Use `size={16}` for inline/small contexts, `size={20}` for buttons, `size={24}` for FABs.

2. **Do NOT change any functional logic, state management, or prop interfaces.** Only modify JSX rendering and CSS. All existing keyboard shortcuts, localStorage persistence, audio/MIDI/BPM features, and timeline functionality must remain intact.

3. **Extract inline styles to CSS classes** where patterns repeat 3+ times. Keep one-off positioning styles inline if they're truly unique.

4. **Add these CSS custom properties** to `:root` in `App.css`:
   ```css
   /* Type scale */
   --text-xs: 0.7rem;
   --text-sm: 0.8rem;
   --text-base: 0.875rem;
   --text-lg: 1rem;
   --text-xl: 1.125rem;

   /* Additional semantic colors */
   --surface-0: #1a1a1a;
   --surface-1: rgba(28, 28, 28, 0.9);
   --surface-2: rgba(255, 255, 255, 0.04);
   --surface-3: rgba(255, 255, 255, 0.08);
   --border-subtle: rgba(255, 255, 255, 0.08);
   --border-default: rgba(255, 255, 255, 0.12);
   --border-strong: rgba(255, 255, 255, 0.2);
   --text-primary: #f0f0f0;
   --text-secondary: rgba(255, 255, 255, 0.7);
   --text-muted: rgba(255, 255, 255, 0.45);

   /* Category accent colors */
   --cat-global: #4fc3f7;
   --cat-layer: #81c784;
   --cat-audio: #ce93d8;
   --cat-preset: #ffb74d;
   --cat-timeline: #90caf9;
   ```

5. **Keep the dark theme.** The existing dark color scheme is good — just make it more refined and consistent. Do not introduce light mode.

6. **Preserve all existing CSS classes** that are used in the codebase. You may add new classes but do not rename or remove existing ones without checking all usage.

7. **Test both workspace modes** (Free and Timeline) after changes. The panel behaves very differently in each mode — fixed/docked in free mode vs. embedded in timeline mode.

8. **Files to modify** (in priority order):
   - `src/App.css` — design tokens, type scale, new utility classes
   - `src/components/BottomPanel.css` — panel chrome, tabs, toolbar
   - `src/components/BottomPanel.jsx` — replace emoji icons, add toolbar grouping
   - `src/components/global/FloatingActionButtons.jsx` — redesign FABs
   - `src/components/global/GlobalControls.jsx` — replace emoji, style details/summary, settings panels
   - `src/components/global/KeyboardShortcutsOverlay.jsx` — modernize modal
   - `src/components/timeline/TimelineTransport.jsx` — extract inline styles, use design tokens
   - `src/components/timeline/TimelineTrackRow.jsx` — improve track headers
   - `src/components/timeline/TimelinePanel.jsx` — add track buttons cleanup
   - `src/components/Controls.jsx` — replace inline dropdown styling
   - `src/components/workspaces/FreeWorkspace.jsx` — timeline toggle button styling
   - `src/components/workspaces/TimelineWorkspace.jsx` — panel boundary styling
   - `src/components/common/DraggableDivider.jsx` — add touch support
   - `src/components/global/sections/GlobalAutomationSections.jsx` — accordion sections, active states

9. **Do NOT create new component files** unless absolutely necessary. Prefer editing existing files.

10. **Run `npm run lint` after all changes** and fix any issues.

---

## SUMMARY OF CHANGES

| Category | Issue | Priority |
|----------|-------|----------|
| Aesthetic | A1 — Inline styles → CSS classes | High |
| Aesthetic | A2 — Emoji → Lucide icons | High |
| Aesthetic | A3 — FAB redesign | Medium |
| Aesthetic | A4 — Color picker refinement | Low |
| Aesthetic | A5 — Control card visual hierarchy | Medium |
| Aesthetic | A6 — Typography scale | High |
| Aesthetic | A7 — Timeline transport styling | Medium |
| Aesthetic | A8 — Timeline track headers | Low |
| Usability | U1 — Panel discovery | Medium |
| Usability | U2 — Compact tab tooltips | Medium |
| Usability | U3 — Toolbar grouping | High |
| Usability | U4 — Shortcuts overlay | Low |
| Usability | U5 — Settings panel hierarchy | Medium |
| Usability | U6 — "Incl" checkbox clarity | Medium |
| Usability | U7 — Layer selector preview indicator | Low |
| Usability | U8 — Timeline controls boundary | Medium |
| Usability | U9 — Scrollbar visibility | Low |
| Usability | U10 — Touch/mobile support | Low |
| Usability | U11 — Undo/redo indication | Low |
| Usability | U12 — Audio matrix organization | Medium |

Focus on **High** and **Medium** priority items first. Low-priority items are nice-to-have polish.
