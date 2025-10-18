import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import { ToolError } from '../errors.js';
import { logError, logInfo } from '../logger.js';
import { AppService } from './appService.js';

const toolsListRequestSchema = z.object({
  method: z.literal('tools/list'),
  params: z
    .object({
      cursor: z.string().optional(),
    })
    .optional(),
});

const toolsCallRequestSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.string(),
    arguments: z.record(z.unknown()).optional(),
  }),
});

const TOOL_DEFINITIONS = [
  {
    name: 'get_schema',
    description: 'Return parameter metadata and default app state structure.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    outputSchema: {
      type: 'object',
      properties: {
        parameters: { type: 'array' },
        appState: { type: 'object' },
      },
    },
  },
  {
    name: 'get_state',
    description: 'Return the current application state with a version number.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    outputSchema: {
      type: 'object',
      properties: {
        version: { type: 'integer' },
        state: { type: 'object' },
      },
      required: ['version', 'state'],
    },
  },
  {
    name: 'set_state',
    description:
      'Replace the application state. Optionally enforce optimistic concurrency via expectedVersion.',
    inputSchema: {
      type: 'object',
      properties: {
        expectedVersion: { type: 'integer', minimum: 1 },
        state: { type: 'object' },
      },
      required: ['state'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        version: { type: 'integer' },
      },
      required: ['version'],
    },
  },
  {
    name: 'get_layer',
    description: 'Fetch a single layer by id or index.',
    inputSchema: {
      type: 'object',
      properties: {
        layerId: { type: 'string' },
        layerIndex: { type: 'integer', minimum: 0 },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        version: { type: 'integer' },
        layer: { type: 'object' },
        index: { type: 'integer' },
      },
      required: ['version', 'layer', 'index'],
    },
  },
  {
    name: 'set_layer',
    description: 'Apply updates to a specific layer.',
    inputSchema: {
      type: 'object',
      properties: {
        layerId: { type: 'string' },
        layerIndex: { type: 'integer', minimum: 0 },
        layer: { type: 'object' },
        expectedVersion: { type: 'integer', minimum: 1 },
      },
      required: ['layer'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        version: { type: 'integer' },
        layer: { type: 'object' },
      },
      required: ['version', 'layer'],
    },
  },
  {
    name: 'add_layer',
    description: 'Insert a new layer at the end or a specific position.',
    inputSchema: {
      type: 'object',
      properties: {
        layer: { type: 'object' },
        position: { type: 'integer', minimum: 0 },
        expectedVersion: { type: 'integer', minimum: 1 },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        version: { type: 'integer' },
        layers: { type: 'array' },
      },
      required: ['version', 'layers'],
    },
  },
  {
    name: 'delete_layer',
    description: 'Remove a layer by id or index.',
    inputSchema: {
      type: 'object',
      properties: {
        layerId: { type: 'string' },
        layerIndex: { type: 'integer', minimum: 0 },
        expectedVersion: { type: 'integer', minimum: 1 },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        version: { type: 'integer' },
        removedIndex: { type: 'integer' },
      },
      required: ['version', 'removedIndex'],
    },
  },
  {
    name: 'randomize',
    description: 'Trigger deterministic randomization for all state, a layer, or palette.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['all', 'layer', 'colors'] },
        layerId: { type: 'string' },
        expectedVersion: { type: 'integer', minimum: 1 },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        version: { type: 'integer' },
      },
      required: ['version'],
    },
  },
  {
    name: 'toggle_freeze',
    description: 'Toggle frozen state or explicitly set the value.',
    inputSchema: {
      type: 'object',
      properties: {
        value: { type: 'boolean' },
        expectedVersion: { type: 'integer', minimum: 1 },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        version: { type: 'integer' },
        isFrozen: { type: 'boolean' },
      },
      required: ['version', 'isFrozen'],
    },
  },
  {
    name: 'export_state',
    description: 'Export a snapshot suitable for later import.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    outputSchema: {
      type: 'object',
      properties: {
        version: { type: 'integer' },
        snapshot: { type: 'object' },
      },
      required: ['version', 'snapshot'],
    },
  },
  {
    name: 'import_state',
    description: 'Import a snapshot and replace the current state.',
    inputSchema: {
      type: 'object',
      properties: {
        snapshot: { type: 'object' },
        expectedVersion: { type: 'integer', minimum: 1 },
      },
      required: ['snapshot'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        version: { type: 'integer' },
      },
      required: ['version'],
    },
  },
  {
    name: 'undo',
    description: 'Revert the state to the previous snapshot if available.',
    inputSchema: {
      type: 'object',
      properties: {
        expectedVersion: { type: 'integer', minimum: 1 },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        version: { type: 'integer' },
        state: { type: 'object' },
      },
      required: ['version', 'state'],
    },
  },
  {
    name: 'redo',
    description: 'Re-apply an undone change if possible.',
    inputSchema: {
      type: 'object',
      properties: {
        expectedVersion: { type: 'integer', minimum: 1 },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        version: { type: 'integer' },
        state: { type: 'object' },
      },
      required: ['version', 'state'],
    },
  },
  {
    name: 'get_history',
    description: 'Return undo/redo stacks with metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        includeUndo: { type: 'boolean' },
        includeRedo: { type: 'boolean' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        version: { type: 'integer' },
        history: { type: 'object' },
      },
      required: ['version', 'history'],
    },
  },
];

const appService = new AppService();

const serialize = (value: unknown) => JSON.stringify(value, null, 2);

const handleToolCall = (name: string, args: Record<string, unknown>) => {
  switch (name) {
    case 'get_schema':
      return appService.getSchema();
    case 'get_state':
      return appService.getState();
    case 'set_state':
      return appService.setState(args);
    case 'get_layer':
      return appService.getLayer(args);
    case 'set_layer':
      return appService.setLayer(args);
    case 'add_layer':
      return appService.addLayer(args);
    case 'delete_layer':
      return appService.deleteLayer(args);
    case 'randomize':
      return appService.randomize(args);
    case 'toggle_freeze':
      return appService.toggleFreeze(args);
    case 'export_state':
      return appService.exportState();
    case 'import_state':
      return appService.importState(args);
    case 'undo':
      return appService.undo(args);
    case 'redo':
      return appService.redo(args);
    case 'get_history':
      return appService.getHistory(args);
    default:
      throw new ToolError('unknown_tool', `Unknown tool '${name}'.`);
  }
};

const formatSuccess = (payload: unknown) => ({
  content: [
    {
      type: 'text' as const,
      text: serialize(payload),
    },
  ],
});

const formatError = (error: unknown) => {
  if (error instanceof ToolError) {
    return {
      content: [
        {
          type: 'text' as const,
          text: serialize({ code: error.code, message: error.message, details: error.details ?? null }),
        },
      ],
      isError: true,
    };
  }

  const fallback = error instanceof Error ? error.message : 'Unknown error';
  return {
    content: [
      {
        type: 'text' as const,
        text: serialize({ code: 'internal_error', message: fallback }),
      },
    ],
    isError: true,
  };
};

export function registerTools(server: Server) {
  logInfo('Registering MCP tools', TOOL_DEFINITIONS.map((tool) => tool.name));

  server.setRequestHandler(toolsListRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

  server.setRequestHandler(toolsCallRequestSchema, async (request) => {
    const { name, arguments: argsRaw } = request.params;
    const args = (argsRaw && typeof argsRaw === 'object') ? (argsRaw as Record<string, unknown>) : {};

    try {
      const result = handleToolCall(name, args);
      return formatSuccess(result);
    } catch (error) {
      logError(`Tool call failed for '${name}'`, error);
      return formatError(error);
    }
  });
}
