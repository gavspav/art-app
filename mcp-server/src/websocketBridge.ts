import { WebSocketServer, WebSocket } from 'ws';
import type { AppState } from '@art-app/core';
import { logError, logInfo } from './logger.js';

interface SnapshotPayload {
  version: number;
  state: AppState;
}

interface BridgeOptions {
  port?: number;
  host?: string;
}

export class WebSocketBridge {
  private readonly port: number;

  private readonly host: string;

  private server?: WebSocketServer;

  private latestSnapshot?: SnapshotPayload;

  constructor(options: BridgeOptions = {}) {
    const envPort = Number.parseInt(process.env.MCP_WS_PORT ?? '', 10);
    const envHost = process.env.MCP_WS_HOST;
    this.port = Number.isFinite(envPort) ? envPort : options.port ?? 3211;
    this.host = envHost || options.host || '127.0.0.1';
  }

  start() {
    if (this.server) {
      return;
    }

    this.server = new WebSocketServer({ port: this.port, host: this.host });

    this.server.on('connection', (socket: WebSocket) => {
      logInfo(`WS bridge client connected (total: ${this.server?.clients.size ?? 0})`);
      socket.on('close', () => {
        logInfo(`WS bridge client disconnected (total: ${this.server?.clients.size ?? 0})`);
      });
      socket.on('error', (error) => {
        logError('WS bridge client error', error);
      });
      if (this.latestSnapshot) {
        try {
          socket.send(this.serializeSnapshot(this.latestSnapshot));
        } catch (error) {
          logError('WS bridge failed to send initial snapshot', error);
        }
      }
    });

    this.server.on('error', (error) => {
      logError('WS bridge server error', error);
    });

    this.server.on('listening', () => {
      logInfo(`WS bridge listening on ws://${this.host}:${this.port}`);
    });
  }

  broadcast(snapshot: SnapshotPayload) {
    if (!this.server) {
      this.latestSnapshot = snapshot;
      return;
    }

    const message = this.serializeSnapshot(snapshot);
    this.latestSnapshot = snapshot;

    for (const client of this.server.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (error) {
          logError('WS bridge failed to broadcast snapshot', error);
        }
      }
    }
  }

  private serializeSnapshot(snapshot: SnapshotPayload) {
    return JSON.stringify({ type: 'snapshot', payload: snapshot });
  }
}
