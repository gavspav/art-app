export const getRuntimeProfile = () => {
  if (typeof window === 'undefined') {
    return { isArcade: false };
  }

  try {
    const params = new URLSearchParams(window.location.search || '');
    return {
      isArcade: ['1', 'true', 'yes', 'on'].includes((params.get('arcade') || '').toLowerCase()),
    };
  } catch {
    return { isArcade: false };
  }
};

