import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import pkg from '../package.json' assert { type: 'json' };
import { registerTools, appService } from './tools/index.js';
import { WebSocketBridge } from './websocketBridge.js';

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
const bridge = new WebSocketBridge();
bridge.start();

appService.setSnapshotListener((snapshot) => {
  bridge.broadcast(snapshot);
});

const initialSnapshot = appService.getState();
bridge.broadcast(initialSnapshot);

await server.connect(transport);
