const clients = new Set();

function addClient(req, res, kind) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Content-Type-Options': 'nosniff',
  });
  res.write('retry: 2000\n\n');
  const client = { res, kind };
  clients.add(client);
  req.on('close', () => clients.delete(client));
  return client;
}

function send(client, type, data) {
  client.res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(type, data, only) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) {
    if (only && c.kind !== only) continue;
    c.res.write(payload);
  }
}

setInterval(() => { for (const c of clients) c.res.write(': ping\n\n'); }, 15000).unref();

module.exports = { addClient, send, broadcast, clients };
