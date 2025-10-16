export const getPixelRatio = (context = null) => {
  const deviceRatio = typeof window !== 'undefined' && window.devicePixelRatio
    ? window.devicePixelRatio
    : 1;

  if (!context) {
    return deviceRatio;
  }

  const backingStore =
    context.backingStorePixelRatio ||
    context.webkitBackingStorePixelRatio ||
    context.mozBackingStorePixelRatio ||
    context.msBackingStorePixelRatio ||
    context.oBackingStorePixelRatio ||
    1;

  if (!backingStore || !Number.isFinite(backingStore) || backingStore <= 0) {
    return deviceRatio;
  }

  return deviceRatio / backingStore;
};
