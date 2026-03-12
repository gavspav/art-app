import { describe, expect, it } from 'vitest';
import { shouldBlurActiveTextInputOnPointerDown } from '../domUtils.js';

describe('shouldBlurActiveTextInputOnPointerDown', () => {
  it('returns true when clicking outside an active text input', () => {
    const input = document.createElement('input');
    input.type = 'text';
    const outside = document.createElement('div');

    document.body.appendChild(input);
    document.body.appendChild(outside);

    expect(shouldBlurActiveTextInputOnPointerDown(input, outside)).toBe(true);

    input.remove();
    outside.remove();
  });

  it('returns false when the next target is another editable control', () => {
    const activeInput = document.createElement('input');
    activeInput.type = 'text';
    const nextInput = document.createElement('input');
    nextInput.type = 'text';

    document.body.appendChild(activeInput);
    document.body.appendChild(nextInput);

    expect(shouldBlurActiveTextInputOnPointerDown(activeInput, nextInput)).toBe(false);

    activeInput.remove();
    nextInput.remove();
  });

  it('returns false when clicking inside the active editable container', () => {
    const wrapper = document.createElement('div');
    const adornment = document.createElement('button');

    wrapper.contentEditable = 'true';
    wrapper.appendChild(adornment);
    document.body.appendChild(wrapper);

    expect(shouldBlurActiveTextInputOnPointerDown(wrapper, adornment)).toBe(false);
    expect(shouldBlurActiveTextInputOnPointerDown(wrapper, wrapper)).toBe(false);

    wrapper.remove();
  });
});
