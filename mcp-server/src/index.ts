import { createRequire } from 'module';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools/index.js';

const require = createRequire(import.meta.url);
const pkgJson = require('../package.json');

const server = new Server(
  {
    name: pkgJson.name ?? 'art-app-mcp-server',
    version: pkgJson.version ?? '0.1.0',
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
