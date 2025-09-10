export const PARAMETERS = [
    // Shape Parameters
    {
        id: 'shapeWidth',
        label: 'Width',
        type: 'slider',
        min: 0.1,
        max: 2.0,
        step: 0.01,
        defaultValue: 1.0,
        isRandomizable: true,
        showInOverlay: true,
        group: 'Shape'
    },
    {
        id: 'shapeHeight',
        label: 'Height',
        type: 'slider',
        min: 0.1,
        max: 2.0,
        step: 0.01,
        defaultValue: 1.0,
        isRandomizable: true,
        showInOverlay: true,
        group: 'Shape'
    },
    {
        id: 'scale',
        label: 'Scale',
        type: 'slider',
        min: 0.1,
        max: 5.0,
        step: 0.01,
        defaultValue: 1.0,
        isRandomizable: true,
        showInOverlay: true,
        group: 'Shape'
    },
    {
        name: 'scale',
        type: 'slider',
        group: 'Shape',
        min: 0.1,
        max: 5.0,
        step: 0.01,
        isRandomizable: true,
        includeInOverlay: true,
    },
    {
        name: 'width',
        type: 'slider',
        group: 'Shape',
        min: 0.01,
        max: 2.0,
        step: 0.01,
        isRandomizable: true,
        includeInOverlay: true,
    },
    {
        name: 'height',
        type: 'slider',
        group: 'Shape',
        min: 0.01,
        max: 2.0,
        step: 0.01,
        isRandomizable: true,
        includeInOverlay: true,
    },
    {
        id: 'numSides',
        label: 'Sides',
        type: 'slider',
        min: 3,
        max: 20,
        step: 1,
        defaultValue: 6,
        isRandomizable: true,
        showInOverlay: true,
        group: 'Shape'
    },
    {
        id: 'curviness',
        label: 'Curviness',
        type: 'slider',
        min: -10,
        max: 10,
        step: 0.1,
        defaultValue: 0,
        isRandomizable: true,
        showInOverlay: true,
        group: 'Shape'
    },
    {
        id: 'noiseAmount',
        label: 'Noise',
        type: 'slider',
        min: 0,
        max: 2,
        step: 0.01,
        defaultValue: 0,
        isRandomizable: true,
        showInOverlay: true,
        group: 'Shape'
    },

    // Appearance Parameters
    {
        id: 'opacity',
        label: 'Opacity',
        type: 'slider',
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: 1,
        isRandomizable: true,
        showInOverlay: true,
        group: 'Appearance'
    },
    {
        name: 'colors',
        type: 'palette',
        group: 'Appearance',
        isRandomizable: true,
        includeInOverlay: false // Handled by ColorPicker component
    },
    {
        name: 'backgroundColor',
        type: 'color',
        group: 'Scene',
        isRandomizable: true,
        includeInOverlay: false // Handled by BackgroundColorPicker component
    },

    // Movement Parameters
    {
        id: 'movementStyle',
        label: 'Style',
        type: 'dropdown',
        options: ['bounce', 'drift', 'still'],
        defaultValue: 'bounce',
        isRandomizable: true,
        showInOverlay: true,
        group: 'Movement'
    },
    {
        id: 'movementSpeed',
        label: 'Speed',
        type: 'slider',
        min: 0,
        max: 0.02,
        step: 0.0001,
        defaultValue: 0.01,
        isRandomizable: true,
        showInOverlay: true,
        group: 'Movement'
    },
    {
        id: 'movementAngle',
        label: 'Angle',
        type: 'slider',
        min: 0,
        max: 360,
        step: 1,
        defaultValue: 45,
        isRandomizable: true,
        showInOverlay: true,
        group: 'Movement'
    },
    {
        id: 'scaleSpeed',
        label: 'Z-Axis Speed',
        type: 'slider',
        min: 0,
        max: 0.2,
        step: 0.001,
        defaultValue: 0,
        isRandomizable: true,
        showInOverlay: true,
        group: 'Movement'
    }
];
