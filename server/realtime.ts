import type { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { nowIsoUtc } from "@shared/datetime";

export type RealtimeEvent = {
  type: string;
  payload?: unknown;
  ts?: string;
};

let wss: WebSocketServer | null = null;

function safeSend(ws: WebSocket, data: string) {
  try {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  } catch {
    // ignore broken connections
  }
}

/**
 * Initializes a WebSocket server on the existing HTTP server.
 * Path: /ws
 *
 * This is intentionally "best-effort" and does not affect existing HTTP routes.
 */
export function initRealtime(httpServer: HttpServer) {
  if (wss) return wss;

  wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
  });

  wss.on("connection", (socket, req) => {
    // Welcome message (useful for debugging and basic client handshake)
    safeSend(
      socket,
      JSON.stringify({
        type: "realtime.connected",
        ts: nowIsoUtc(),
        payload: { url: req.url ?? "" },
      } satisfies RealtimeEvent),
    );

    socket.on("message", (buf) => {
      // Minimal protocol: support ping/pong without throwing.
      // Clients can also send JSON; we ignore unknown messages.
      const text = typeof buf === "string" ? buf : buf.toString("utf-8");
      if (text === "ping") {
        safeSend(socket, "pong");
      }
    });
  });

  return wss;
}

export function broadcast(event: RealtimeEvent) {
  if (!wss) return;
  const data = JSON.stringify({
    ...event,
    ts: event.ts ?? nowIsoUtc(),
  } satisfies RealtimeEvent);

  wss.clients.forEach((client) => {
    safeSend(client as WebSocket, data);
  });
}

export function getRealtimeInfo() {
  return {
    enabled: Boolean(wss),
    clients: wss ? wss.clients.size : 0,
    path: "/ws",
  };
}
