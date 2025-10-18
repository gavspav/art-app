import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ZodTypeAny } from 'zod';

interface HandlerEntry {
  schema: ZodTypeAny;
  handler: (request: unknown) => Promise<unknown> | unknown;
}

class MockServer {
  public handlers: HandlerEntry[] = [];

  setRequestHandler(schema: ZodTypeAny, handler: HandlerEntry['handler']) {
    this.handlers.push({ schema, handler });
  }
}

const invoke = async (server: MockServer, request: unknown) => {
  const entry = server.handlers.find(({ schema }) => schema.safeParse(request).success);
  if (!entry) {
    throw new Error('No handler registered for request');
  }
  return entry.handler(request);
};

const invokeTool = async (server: MockServer, name: string, args: Record<string, unknown> = {}) => {
  const response = await invoke(server, {
    method: 'tools/call',
    params: {
      name,
      arguments: Object.keys(args).length > 0 ? args : undefined,
    },
  });

  const { content, isError } = response as { content?: Array<{ type: string; text: string }>; isError?: boolean };
  const payload = content && content.length > 0 ? JSON.parse(content[0].text) : undefined;
  return { response, payload, isError: Boolean(isError) };
};

describe('registerTools()', () => {
  let server: MockServer;
  let registerTools: ((server: MockServer) => void) | undefined;

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('../../logger.js', () => ({
      logInfo: vi.fn(),
      logError: vi.fn(),
    }));

    const module = await import('../index.js');
    registerTools = module.registerTools;
    server = new MockServer();
    registerTools(server as unknown as any);
  });

  test('lists all registered tools', async () => {
    const response = await invoke(server, { method: 'tools/list', params: {} });
    const tools = (response as { tools: Array<{ name: string }> }).tools.map((tool) => tool.name);
    expect(tools).toContain('get_state');
    expect(tools).toContain('undo');
    expect(tools).toContain('import_state');
  });

  test('get_state returns current version and state snapshot', async () => {
    const { payload, isError } = await invokeTool(server, 'get_state');
    expect(isError).toBe(false);
    expect(payload.version).toBeGreaterThan(0);
    expect(payload.state).toBeDefined();
  });

  test('set_state enforces optimistic concurrency and increments version', async () => {
    const initial = await invokeTool(server, 'get_state');
    const next = await invokeTool(server, 'set_state', {
      expectedVersion: initial.payload.version,
      state: initial.payload.state,
    });

    expect(next.isError).toBe(false);
    expect(next.payload.version).toBeGreaterThan(initial.payload.version);

    const conflict = await invokeTool(server, 'set_state', {
      expectedVersion: initial.payload.version,
      state: initial.payload.state,
    });

    expect(conflict.isError).toBe(true);
    expect(conflict.payload.code).toBe('version_conflict');
  });

  test('undo without history returns a descriptive error', async () => {
    const result = await invokeTool(server, 'undo');
    expect(result.isError).toBe(true);
    expect(result.payload.code).toBe('nothing_to_undo');
  });

  test('unknown tool surfaces ToolError details', async () => {
    const result = await invokeTool(server, 'nonexistent_tool');
    expect(result.isError).toBe(true);
    expect(result.payload.code).toBe('unknown_tool');
    expect(result.payload.message).toMatch(/Unknown tool/);
  });
});
