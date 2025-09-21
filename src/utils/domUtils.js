// Utility helpers for DOM-focused checks
export const isTextInputLike = (el) => {
  if (!el) return false;
  // Handle React synthetic targets which may expose .target?.tagName
  const node = el.target ? el.target : el;
  const tag = (node.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (node.isContentEditable) return true;
  if (typeof node.closest === 'function') {
    const nearest = node.closest('input,textarea,select,[contenteditable="true"]');
    if (nearest) return true;
  }
  // Some components forward to nested inputs; walk up a shallow parent chain
  const parent = node.parentElement;
  if (parent) {
    const parentTag = (parent.tagName || '').toLowerCase();
    if (parentTag === 'input' || parentTag === 'textarea' || parentTag === 'select' || parent.isContentEditable) {
      return true;
    }
  }
  return false;
};

export const shouldIgnoreGlobalKey = (event) => {
  if (!event) return false;
  if (isTextInputLike(event.target)) return true;
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  if (active && isTextInputLike(active)) return true;
  return false;
};
