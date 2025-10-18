import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools/index.js';
import pkg from '../package.json' assert { type: 'json' };

const server = new Server(
  {
    name: pkg.name ?? 'art-app-mcp-server',
    version: pkg.version ?? '0.1.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
