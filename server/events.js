const HEARTBEAT_MS = 25_000;

/** Fan-out of Server-Sent Events to every open browser. */
export function createHub() {
  const clients = new Set();

  const timer = setInterval(() => {
    for (const res of clients) res.write(': ping\n\n');
  }, HEARTBEAT_MS);
  timer.unref();

  function send(res, type, data) {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  return {
    /** Express handler for GET /api/events. `initial()` is sent straight after connecting. */
    handler(initial) {
      return (req, res) => {
        res.set({
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        res.flushHeaders();
        res.write('retry: 2000\n\n');
        send(res, 'state', initial());
        clients.add(res);
        req.on('close', () => clients.delete(res));
      };
    },

    broadcast(type, data) {
      for (const res of clients) send(res, type, data);
    },

    get size() {
      return clients.size;
    },
  };
}
