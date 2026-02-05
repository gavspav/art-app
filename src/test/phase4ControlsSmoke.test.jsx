import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LayerAnimationSection from '../components/layer/sections/LayerAnimationSection.jsx';
import LayerShapeSection from '../components/layer/sections/LayerShapeSection.jsx';
import LayerColorSection from '../components/layer/sections/LayerColorSection.jsx';

describe('Phase 4 control section smoke', () => {
  it('LayerAnimationSection triggers randomize and orbit handlers', () => {
    const onRandomize = vi.fn();
    const onOrbit = vi.fn(() => () => {});
    const DynamicControl = ({ param }) => <div data-testid={`dc-${param.id}`}>{param.id}</div>;

    render(
      <LayerAnimationSection
        currentLayer={{ id: 'l1', movementStyle: 'orbit', orbitRadiusX: 0.1, orbitRadiusY: 0.2 }}
        editTarget={{ type: 'single' }}
        movementParams={[{ id: 'movementSpeed' }]}
        DynamicControl={DynamicControl}
        updateLayer={vi.fn()}
        setLayers={vi.fn()}
        buildTargetSet={vi.fn()}
        targetMode="individual"
        debugSettingsEnabled={false}
        randomizeAnimationOnly={onRandomize}
        handleOrbitRadiusChange={onOrbit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Randomize animation for selected layer' }));
    expect(onRandomize).toHaveBeenCalledTimes(1);
    expect(onOrbit).toHaveBeenCalledWith('x');
    expect(onOrbit).toHaveBeenCalledWith('y');
  });

  it('LayerShapeSection updates include toggle and rotation mapping controls render', () => {
    const setIsRnd = vi.fn();
    const DynamicControl = ({ param }) => <div>{param.id}</div>;
    const MidiRotationStatus = () => <div>MIDI rotation</div>;
    const AudioRotationStatus = () => <div>Audio rotation</div>;
    const BPMRotationStatus = () => <div>BPM rotation</div>;

    render(
      <LayerShapeSection
        currentLayer={{ id: 'l1', layerType: 'shape', rotation: 10, name: 'Layer 1' }}
        editTarget={{ type: 'single' }}
        shapeParams={[{ id: 'numSides' }]}
        DynamicControl={DynamicControl}
        updateLayer={vi.fn()}
        setLayers={vi.fn()}
        buildTargetSet={vi.fn()}
        targetMode="individual"
        debugSettingsEnabled={false}
        rotateMin={-180}
        rotateMax={180}
        showRotateSettings={true}
        setShowRotateSettings={vi.fn()}
        setRotateMin={vi.fn()}
        setRotateMax={vi.fn()}
        applyRotation={vi.fn()}
        getIsRnd={() => true}
        setIsRnd={setIsRnd}
        MidiRotationStatus={MidiRotationStatus}
        AudioRotationStatus={AudioRotationStatus}
        BPMRotationStatus={BPMRotationStatus}
      />,
    );

    expect(screen.getByText('MIDI rotation')).toBeTruthy();
    expect(screen.getByText('Audio rotation')).toBeTruthy();
    expect(screen.getByText('BPM rotation')).toBeTruthy();

    const include = screen.getByLabelText('Include in Randomize All');
    fireEvent.click(include);
    expect(setIsRnd).toHaveBeenCalled();
  });

  it('LayerColorSection toggles palette/num-color settings and randomize action', () => {
    const setRandomizePalette = vi.fn();
    const setRandomizeNumColors = vi.fn();
    const onRandomizeColors = vi.fn();

    render(
      <LayerColorSection
        currentLayer={{ id: 'l1', name: 'Layer 1', colors: ['#ff0000'], numColors: 1, colorFadeEnabled: false }}
        editTarget={{ type: 'single' }}
        targetMode="individual"
        updateLayer={vi.fn()}
        setLayers={vi.fn()}
        buildTargetSet={vi.fn()}
        applyTargetedUpdate={vi.fn()}
        MidiColorSection={() => <div>MIDI colors</div>}
        randomizePalette={true}
        setRandomizePalette={setRandomizePalette}
        randomizeNumColors={false}
        setRandomizeNumColors={setRandomizeNumColors}
        colorCountMin={1}
        colorCountMax={5}
        setColorCountMin={vi.fn()}
        setColorCountMax={vi.fn()}
        midiSupported={false}
        midiMappings={{}}
        mappingLabel={() => 'mapped'}
        learnParamId={null}
        beginLearn={vi.fn()}
        clearMapping={vi.fn()}
        onRandomizeLayerColors={onRandomizeColors}
        showColourSettings={true}
        setShowColourSettings={vi.fn()}
        palettes={[]}
        paletteOptions={{ builtins: [], customs: [] }}
        paletteValueMap={new Map()}
        matchPaletteValue={() => 'custom'}
        sampleColors={() => ['#ff0000']}
        onSaveCustomPalette={vi.fn()}
        AudioRotationStatus={() => <div>Audio palette</div>}
        BPMRotationStatus={() => <div>BPM palette</div>}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Randomize colours' }));
    expect(onRandomizeColors).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('Randomise palette'));
    expect(setRandomizePalette).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Randomise number of colours'));
    expect(setRandomizeNumColors).toHaveBeenCalled();
  });
});
