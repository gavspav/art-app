export const logInfo = (...args: unknown[]) => {
  console.log('[MCP]', ...args);
};

export const logError = (...args: unknown[]) => {
  console.error('[MCP ERROR]', ...args);
};
