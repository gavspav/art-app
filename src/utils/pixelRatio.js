// LEGACY DISABLED: retained for reference, not used in current app flow.
// Original implementation:
// export const getPixelRatio = (context) => {
//   const backingStore =
//     context.backingStorePixelRatio ||
//     context.webkitBackingStorePixelRatio ||
//     context.mozBackingStorePixelRatio ||
//     context.msBackingStorePixelRatio ||
//     context.oBackingStorePixelRatio ||
//     1;
// 
//   return (window.devicePixelRatio || 1) / backingStore;
// };
export const getPixelRatio = (_context) => {
  return typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
}
