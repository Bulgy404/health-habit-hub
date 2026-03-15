import { WebSocketServer } from 'ws';

// connections: Map<userId, Set<WebSocket>>
const connections = new Map();

export function createRecommendationWsServer(httpServer, { verifyToken } = {}) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname !== '/ws/recommendations') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws);
    });
  });

  wss.on('connection', (ws) => {
    let authenticated = false;
    let userId = null;

    // Disconnect unauthenticated sockets after 5 seconds
    const authTimer = setTimeout(() => {
      if (!authenticated) ws.terminate();
    }, 5000);

    ws.on('message', async (data) => {
      if (authenticated) return;

      const token = data.toString();
      try {
        const payload = await verifyToken(token);
        if (!payload || !payload.sub) {
          ws.terminate();
          return;
        }
        authenticated = true;
        userId = payload.sub;
        clearTimeout(authTimer);

        if (!connections.has(userId)) connections.set(userId, new Set());
        connections.get(userId).add(ws);

        ws.on('close', () => {
          const set = connections.get(userId);
          if (set) {
            set.delete(ws);
            if (set.size === 0) connections.delete(userId);
          }
        });
      } catch {
        ws.terminate();
      }
    });
  });

  function broadcast(userId, message) {
    const set = connections.get(userId);
    if (!set) return;
    const data = JSON.stringify(message);
    for (const ws of set) {
      if (ws.readyState === 1 /* OPEN */) {
        ws.send(data);
      }
    }
  }

  return { wss, broadcast };
}
