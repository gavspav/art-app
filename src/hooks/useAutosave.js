import { useEffect, useRef } from 'react';

const AUTOSAVE_INTERVAL_MS = 30000; // 30s
const MIN_GAP_BETWEEN_SAVES_MS = 10000; // 10s
const AUTOSAVE_SLOT_COUNT = 3;
const META_KEY = 'artapp-autosave-meta';
const SLOT_PREFIX = 'artapp-autosave-';

const hasStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const readMeta = () => {
  if (!hasStorage()) {
    return {
      currentSlot: -1,
      slots: [],
    };
  }
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) {
      return {
        currentSlot: -1,
        slots: [],
      };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {
        currentSlot: -1,
        slots: [],
      };
    }
    return {
      currentSlot: typeof parsed.currentSlot === 'number' ? parsed.currentSlot : -1,
      slots: Array.isArray(parsed.slots) ? parsed.slots : [],
    };
  } catch (error) {
    console.warn('[Autosave] Failed to read meta', error);
    return {
      currentSlot: -1,
      slots: [],
    };
  }
};

const writeMeta = (meta) => {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch (error) {
    console.warn('[Autosave] Failed to persist meta', error);
  }
};

const writeSlot = (slotIndex, payload) => {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(`${SLOT_PREFIX}${slotIndex}`, JSON.stringify(payload));
  } catch (error) {
    console.warn('[Autosave] Failed to persist slot', slotIndex, error);
  }
};

/**
 * Hook that periodically writes the current parameters + app state to rotating autosave slots.
 * Expects the caller to supply dirty tracking & snapshot helpers from context.
 */
export const useAutosave = ({
  isDirty,
  setIsDirty,
  lastSavedAt,
  setLastSavedAt,
  getCurrentAppState,
  parameters,
  isFrozen,
}) => {
  const latestRef = useRef({
    isDirty,
    lastSavedAt,
    getCurrentAppState,
    parameters,
    isFrozen,
  });

  useEffect(() => {
    latestRef.current = {
      isDirty,
      lastSavedAt,
      getCurrentAppState,
      parameters,
      isFrozen,
    };
  }, [isDirty, lastSavedAt, getCurrentAppState, parameters, isFrozen]);

  useEffect(() => {
    if (!hasStorage()) return () => {};

    const timer = setInterval(() => {
      const {
        isDirty: dirty,
        lastSavedAt: lastSaved,
        getCurrentAppState: snapshotFn,
        parameters: params,
        isFrozen: frozen,
      } = latestRef.current;

      if (!dirty) return;
      if (frozen) return; // optional pause while frozen
      const now = Date.now();
      if (now - lastSaved < MIN_GAP_BETWEEN_SAVES_MS) return;
      if (typeof snapshotFn !== 'function') return;

      try {
        const snapshot = {
          parameters: Array.isArray(params) ? params : [],
          appState: snapshotFn(),
          savedAt: new Date().toISOString(),
          version: '2.0',
        };

        const meta = readMeta();
        const nextSlot = (meta.currentSlot + 1) % AUTOSAVE_SLOT_COUNT;
        writeSlot(nextSlot, snapshot);

        const slots = Array.isArray(meta.slots) ? [...meta.slots] : [];
        slots[nextSlot] = {
          key: `${SLOT_PREFIX}${nextSlot}`,
          timestamp: snapshot.savedAt,
        };
        writeMeta({
          currentSlot: nextSlot,
          slots,
        });

        setIsDirty(false);
        setLastSavedAt(now);
        try {
          console.debug('[Autosave] saved snapshot', { slot: nextSlot, timestamp: snapshot.savedAt });
        } catch {
          /* noop */
        }
      } catch (error) {
        console.warn('[Autosave] Failed to capture snapshot', error);
      }
    }, AUTOSAVE_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [setIsDirty, setLastSavedAt]);
};
