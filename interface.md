# Creative Drawing Application Interface Redesign Instructions

## Overview
Transform a cluttered, dense sidebar interface into a modern, accessible, and space-efficient **bottom-docked auto-hide interface** for a creative drawing/animation application.

## Current Interface Problems
- **Dense information hierarchy**: Controls are cramped together with poor visual separation
- **Inefficient space usage**: Excessive vertical scrolling required, poor horizontal space utilization
- **Poor visual grouping**: Related controls lack clear organization
- **Accessibility issues**: Limited keyboard navigation, unclear focus states
- **Inconsistent spacing**: No systematic approach to margins and padding
- **Overwhelming complexity**: All controls visible simultaneously causing cognitive overload

## Design Principles to Follow

### 1. Progressive Disclosure
- Use collapsible sections to hide/show content based on user needs
- Implement tabbed interfaces for related control groups
- Show contextual controls only when relevant

### 2. Visual Hierarchy
- Use card-based layouts with clear boundaries
- Implement consistent spacing using 4px, 8px, 12px, 16px, 24px scale
- Apply proper typography hierarchy (headings, labels, values)

### 3. Accessibility First
- Ensure all interactive elements have proper ARIA labels
- Implement keyboard navigation for all controls
- Maintain high contrast ratios (minimum 4.5:1)
- Provide clear focus indicators

### 4. Space Efficiency
- **Maximize canvas area**: Bottom-dock interface leaves entire screen for creative work
- **Auto-hide behavior**: Interface slides down when not needed, appears on demand
- **Horizontal organization**: Utilize full screen width for control layout
- **Contextual panels**: Show relevant controls based on current tool/selection

## Implementation Steps

### Step 1: Create Bottom-Docked Interface Structure

#### Main Layout Architecture
\`\`\`
Full-screen canvas area with bottom-docked control panel:
- Canvas: Full viewport height minus docked panel
- Control Panel: Fixed height (120-200px), slides up from bottom
- Auto-hide: Panel disappears after 3 seconds of inactivity
- Reveal triggers: Cursor near bottom edge, keyboard shortcuts, or interaction
\`\`\`

#### Panel States
- **Hidden**: Completely off-screen (translateY(100%))
- **Peek**: Minimal 20px visible strip showing panel exists
- **Expanded**: Full panel height with all controls visible
- **Locked**: Panel stays visible (toggle with pin icon)

### Step 2: Reorganize Control Sections

#### A. Presets Section
- **Layout**: Grid of circular preset buttons (4 columns, 2 rows)
- **Visual states**: 
  - Active: Blue border (2px solid)
  - Available: Green border (1px solid)
  - Unavailable: Dashed gray border
- **Accessibility**: Add `aria-label` with preset name and status

#### B. Global Settings Section
- **Organization**: Group into logical cards:
  - Morphing Controls (Route, Duration, Easing, Mode, Morph type)
  - Background Settings (Color picker, Image toggle, Include checkbox)
  - System Settings (Freeze, Z-Ignore, MIDI Learn, etc.)
  - Performance Settings (Speed, Opacity, Layers)

#### C. Layer Controls Section
- **Structure**: 
  - Layer selector dropdown at top
  - Action buttons (Add, Move Up, Move Down, Delete) in horizontal row
  - Export options (SVG, etc.) as icon buttons
- **Tabbed interface** for Shape/Animation/Color with clear active states

### Step 3: Improve Individual Controls

#### Sliders
- **Layout**: Label on left, value on right, slider below
- **Styling**: 
  - Track: Gray background with rounded ends
  - Thumb: Blue circle with subtle shadow
  - Active state: Larger thumb with glow effect
- **Accessibility**: Include `aria-valuemin`, `aria-valuemax`, `aria-valuenow`

#### Dropdowns
- **Styling**: Dark background with subtle border, rounded corners
- **States**: Clear hover and focus indicators
- **Accessibility**: Proper `aria-expanded` and `aria-haspopup` attributes

#### Checkboxes
- **Design**: Custom styled with checkmark icon
- **Layout**: Checkbox on left, label on right with proper spacing
- **States**: Clear visual feedback for checked/unchecked/indeterminate

#### Input Fields
- **Styling**: Consistent with dropdown styling
- **Validation**: Clear error states with red borders and messages
- **Accessibility**: Associated labels and error announcements

### Step 4: Implement Collapsible Sections

#### Section Headers
- **Design**: Bold text with expand/collapse chevron icon
- **Interaction**: Entire header clickable, smooth animation
- **State persistence**: Remember expanded/collapsed state

#### Animation
- **Expand/Collapse**: 200ms ease-in-out transition
- **Content**: Fade in/out with slight scale effect
- **Performance**: Use CSS transforms for smooth animations

### Step 5: Add Contextual Features

#### Smart Visibility
- Hide irrelevant controls based on current settings
- Example: Hide morph duration when morphing is disabled
- Show/hide advanced options with "Show More" toggle

#### Quick Actions
- Floating action buttons for common tasks
- Keyboard shortcuts with visual indicators
- Context menus for advanced options

## Technical Implementation Guidelines

### CSS Structure
\`\`\`css
:root {
  --panel-height: 160px;
  --panel-peek-height: 20px;
  --animation-duration: 300ms;
  --trigger-zone: 50px;
}

.control-panel {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: var(--panel-height);
  transform: translateY(100%);
  transition: transform var(--animation-duration) ease-out;
  z-index: 1000;
}

.control-panel.visible {
  transform: translateY(0);
}

.control-panel.peek {
  transform: translateY(calc(100% - var(--panel-peek-height)));
}
\`\`\`

### Component Architecture
- Create reusable components for common controls
- Implement consistent prop interfaces
- Use compound components for complex controls (slider with label and value)

### State Management
- Track expanded/collapsed states for sections
- Manage active tab states
- Handle control values with proper validation

### Responsive Behavior

#### Mobile/Touch Adaptations
- **Swipe gestures**: Swipe up from bottom to reveal panel
- **Touch targets**: Minimum 44px touch targets for all controls
- **Panel height**: Adaptive height based on screen size
- **Simplified layout**: Stack sections vertically on narrow screens

#### Desktop Optimizations
- **Multi-monitor**: Panel appears on active monitor
- **High DPI**: Crisp icons and text at all zoom levels
- **Window resize**: Panel adapts to window width changes

## Accessibility Checklist

### Keyboard Navigation
- [ ] Tab order follows logical flow
- [ ] All interactive elements focusable
- [ ] Escape key closes dropdowns/modals
- [ ] Arrow keys navigate within control groups

### Screen Reader Support
- [ ] Proper heading structure (h1, h2, h3)
- [ ] Descriptive labels for all controls
- [ ] Status announcements for value changes
- [ ] Group labels for related controls

### Visual Accessibility
- [ ] High contrast mode support
- [ ] Focus indicators clearly visible
- [ ] Text scalable to 200% without horizontal scrolling
- [ ] Color not the only means of conveying information

## Testing Requirements

### Functional Testing
- Verify all controls maintain their original functionality
- Test state persistence across sessions
- Validate responsive behavior at different screen sizes

### Accessibility Testing
- Screen reader testing (NVDA, JAWS, VoiceOver)
- Keyboard-only navigation testing
- Color contrast validation
- Focus management verification

### Performance Testing
- Smooth animations at 60fps
- Fast section expand/collapse
- Efficient re-rendering of control updates

## Success Metrics
- **Canvas utilization**: 95%+ of screen space available for creative work
- **Access speed**: Controls appear within 200ms of trigger
- **Accessibility**: Full keyboard navigation and screen reader support
- **User satisfaction**: Reduced interface friction, increased focus on creativity
- **Performance**: 60fps animations, no input lag

## Final Notes
- Maintain all existing functionality while improving organization
- Prioritize accessibility throughout implementation
- Use consistent design tokens for scalable theming
- Test thoroughly with actual users of creative applications
- Document any deviations from these specifications with reasoning
