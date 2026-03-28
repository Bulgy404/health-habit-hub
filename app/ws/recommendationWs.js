import { WebSocketServer } from 'ws';

// connections: Map<userId, Set<WebSocket>>
const connections = new Map();

export function createRecommendationWsServer(httpServer, { verifyToken } = {}) {
  const wss = new WebSocketServer({ noServer: true });
  const authTimers = new WeakMap();

  function handleUpgrade(request, socket, head) {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname !== '/ws/recommendations') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws);
    });
  }

  httpServer.on('upgrade', handleUpgrade);

  wss.on('connection', (ws) => {
    let authenticated = false;
    let userId = null;

    // Disconnect unauthenticated sockets after 5 seconds
    const authTimer = setTimeout(() => {
      if (!authenticated) ws.terminate();
    }, 5000);
    authTimers.set(ws, authTimer);

    ws.on('close', () => {
      clearTimeout(authTimers.get(ws));
      authTimers.delete(ws);
      if (!userId) return;
      const set = connections.get(userId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) connections.delete(userId);
      }
    });

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
        authTimers.delete(ws);

        if (!connections.has(userId)) connections.set(userId, new Set());
        connections.get(userId).add(ws);
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

  function close() {
    httpServer.off('upgrade', handleUpgrade);
    for (const set of connections.values()) {
      for (const ws of set) {
        clearTimeout(authTimers.get(ws));
        authTimers.delete(ws);
        ws.terminate();
      }
    }
    connections.clear();
    return new Promise((resolve) => wss.close(resolve));
  }

  return { wss, broadcast, close };
}
