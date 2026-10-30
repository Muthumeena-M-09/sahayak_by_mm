import type { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

export interface RealtimeEvent {
  eventId: string;
  type:
    | 'conversation:updated'
    | 'message:created'
    | 'application:updated'
    | 'grievance:updated'
    | 'notification:created';
  payload: Record<string, any>;
  timestamp: string;
}

interface ClientMeta {
  ws: WebSocket;
  userUid: string | null;
  isAdminOrAgent: boolean;
}

class RealtimeHub {
  private wss: WebSocketServer | null = null;
  private clients = new Set<ClientMeta>();

  attach(server: HttpServer) {
    // Use noServer: true so non-/ws upgrade requests (e.g., Vite HMR sockets) are never aborted
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
      try {
        const pathname = new URL(req.url || '/', 'http://localhost').pathname;
        if (pathname !== '/ws' || !this.wss) {
          return;
        }
        this.wss.handleUpgrade(req, socket, head, (ws) => {
          this.wss?.emit('connection', ws, req);
        });
      } catch {
        // Ignore malformed upgrade URLs
      }
    });

    this.wss.on('connection', (ws) => {
      const meta: ClientMeta = {
        ws,
        userUid: null,
        isAdminOrAgent: false,
      };
      this.clients.add(meta);

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(String(raw));
          if (msg.type === 'subscribe') {
            meta.userUid = typeof msg.userUid === 'string' ? msg.userUid : null;
            meta.isAdminOrAgent = Boolean(msg.isAdminOrAgent);
            ws.send(
              JSON.stringify({
                eventId: `ack_${Date.now()}`,
                type: 'subscribed',
                payload: { userUid: meta.userUid, isAdminOrAgent: meta.isAdminOrAgent },
                timestamp: new Date().toISOString(),
              })
            );
          }
        } catch {
          // Ignore malformed client frames
        }
      });

      ws.on('close', () => {
        this.clients.delete(meta);
      });

      ws.on('error', () => {
        this.clients.delete(meta);
      });
    });
  }

  broadcastToUser(userUid: string, type: RealtimeEvent['type'], payload: Record<string, any>) {
    const evt: RealtimeEvent = {
      eventId: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      payload,
      timestamp: new Date().toISOString(),
    };
    const serialized = JSON.stringify(evt);
    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN && client.userUid === userUid) {
        client.ws.send(serialized);
      }
    }
  }

  broadcastToAdmins(type: RealtimeEvent['type'], payload: Record<string, any>) {
    const evt: RealtimeEvent = {
      eventId: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      payload,
      timestamp: new Date().toISOString(),
    };
    const serialized = JSON.stringify(evt);
    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN && client.isAdminOrAgent) {
        client.ws.send(serialized);
      }
    }
  }
}

export const realtimeHub = new RealtimeHub();
