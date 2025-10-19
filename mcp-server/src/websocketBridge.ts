import { WebSocketServer, type WebSocket } from 'ws';
import { logError, logInfo } from './logger.js';
import { appService } from './tools/index.js';

interface BridgeOptions {
  port?: number;
  host?: string;
}

const buildSnapshotMessage = (snapshot: { version: number; state: unknown }) =>
  JSON.stringify({ type: 'snapshot', payload: snapshot });

const broadcast = (clients: Set<WebSocket>, data: string) => {
  for (const client of clients) {
    if (client.readyState === client.OPEN) {
      try {
        client.send(data);
      } catch (error) {
        logError('Failed to broadcast snapshot', error);
      }
    }
  }
};

export const createWebSocketBridge = (options: BridgeOptions = {}) => {
  const port = Number.isFinite(options.port)
    ? Number(options.port)
    : Number(process.env.MCP_WS_PORT ?? 5175);
  const host = options.host ?? process.env.MCP_WS_HOST ?? '0.0.0.0';

  const wss = new WebSocketServer({ port, host });
  const clients = new Set<WebSocket>();

  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws);
    logInfo('WebSocket client connected', { count: clients.size });

    const snapshot = appService.getState();
    try {
      ws.send(buildSnapshotMessage(snapshot));
    } catch (error) {
      logError('Failed to send initial snapshot', error);
    }

    ws.on('close', () => {
      clients.delete(ws);
      logInfo('WebSocket client disconnected', { count: clients.size });
    });

    ws.on('error', (error: Error) => {
      logError('WebSocket client error', error);
    });
  });

  wss.on('error', (error: Error) => {
    logError('WebSocket server error', error);
  });

  appService.setSnapshotListener((snapshot) => {
    broadcast(clients, buildSnapshotMessage(snapshot));
  });

  logInfo('WebSocket bridge listening', { host, port });

  return {
    close: () => wss.close(),
    port,
    host,
  };
};
