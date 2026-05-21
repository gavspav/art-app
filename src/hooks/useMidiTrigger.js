import { useEffect, useRef } from 'react';

const MIDI_TRIGGER_THRESHOLD = 0.5;

export const buildMidiRandomizeId = (paramId) => (
  paramId ? `randomize:${paramId}` : null
);

export function useMidiTrigger(registerParamHandler, paramId, onTrigger) {
  const previousValueRef = useRef(0);
  const onTriggerRef = useRef(onTrigger);

  useEffect(() => {
    onTriggerRef.current = onTrigger;
  }, [onTrigger]);

  useEffect(() => {
    if (!registerParamHandler || !paramId) return undefined;
    previousValueRef.current = 0;

    const unregister = registerParamHandler(paramId, ({ value01 }) => {
      const previous = previousValueRef.current || 0;
      const current = Math.max(0, Math.min(1, Number(value01) || 0));

      if (previous < MIDI_TRIGGER_THRESHOLD && current >= MIDI_TRIGGER_THRESHOLD) {
        onTriggerRef.current?.();
      }

      previousValueRef.current = current;
    });

    return () => {
      if (typeof unregister === 'function') unregister();
    };
  }, [registerParamHandler, paramId]);
}

export function useMidiTriggers(registerParamHandler, triggers) {
  const previousValuesRef = useRef(new Map());
  const triggersRef = useRef(new Map());
  const triggerKey = Array.from(new Set(
    (Array.isArray(triggers) ? triggers : [])
      .map(trigger => trigger?.paramId)
      .filter(Boolean),
  )).join('\0');

  useEffect(() => {
    const next = new Map();
    (Array.isArray(triggers) ? triggers : []).forEach((trigger) => {
      if (trigger?.paramId && typeof trigger.onTrigger === 'function') {
        next.set(trigger.paramId, trigger.onTrigger);
      }
    });
    triggersRef.current = next;
  }, [triggers]);

  useEffect(() => {
    if (!registerParamHandler || !triggerKey) return undefined;

    const paramIds = triggerKey.split('\0').filter(Boolean);
    previousValuesRef.current = new Map(paramIds.map(paramId => [paramId, 0]));

    const unregisters = paramIds.map((paramId) => (
      registerParamHandler(paramId, ({ value01 }) => {
        const previous = previousValuesRef.current.get(paramId) || 0;
        const current = Math.max(0, Math.min(1, Number(value01) || 0));

        if (previous < MIDI_TRIGGER_THRESHOLD && current >= MIDI_TRIGGER_THRESHOLD) {
          triggersRef.current.get(paramId)?.();
        }

        previousValuesRef.current.set(paramId, current);
      })
    ));

    return () => {
      unregisters.forEach((unregister) => {
        if (typeof unregister === 'function') unregister();
      });
    };
  }, [registerParamHandler, triggerKey]);
}
