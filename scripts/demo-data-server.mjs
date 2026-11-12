// Beispiel-Datenquelle für den Digitalen Zwilling, zum Ausprobieren von REST, SSE und WebSocket.
//
//   npm run demo:data            startet auf Port 4800 mit simulierten Werten
//   node scripts/demo-data-server.mjs --static --port 4801   ohne Simulation
//
//   REST       http://localhost:4800/data
//   SSE        http://localhost:4800/events
//   WebSocket  ws://localhost:4800/ws
//   Wert setzen (zum Testen): http://localhost:4800/set?motor.status=error&motor.rpm=0
//
// So ein Dienst ist auch der richtige Ort für Zugangsdaten: Er fragt die eigentliche Quelle mit
// Zugangsdaten ab und gibt der Website nur die Werte weiter, die sie anzeigen soll.

import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1]) || 4800;
const simulate = !args.includes('--static');

const data = { motor: { rpm: 1480, temperature: 62.5, status: 'running' }, door: { open: false } };
const eventClients = new Set();
const sockets = new Set();

function setPath(key, value) {
  const parts = key.split('.');
  let target = data;
  for (const part of parts.slice(0, -1)) target = target[part] ??= {};
  target[parts.at(-1)] = value;
}

function parseValue(text) {
  if (text === 'true') return true;
  if (text === 'false') return false;
  return text !== '' && !Number.isNaN(Number(text)) ? Number(text) : text;
}

/** Ein unmaskierter Text-Frame nach RFC 6455. */
function frame(text) {
  const payload = Buffer.from(text);
  const header = payload.length < 126 ? Buffer.from([0x81, payload.length]) : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 255]);
  return Buffer.concat([header, payload]);
}

function broadcast() {
  const text = JSON.stringify(data);
  for (const client of eventClients) client.write(`data: ${text}\n\n`);
  for (const socket of sockets) socket.write(frame(text));
}

const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'no-store');

  if (url.pathname === '/data') {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(data));
  } else if (url.pathname === '/events') {
    response.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
    response.write(`data: ${JSON.stringify(data)}\n\n`);
    eventClients.add(response);
    request.on('close', () => eventClients.delete(response));
  } else if (url.pathname === '/set') {
    for (const [key, value] of url.searchParams) setPath(key, parseValue(value));
    broadcast();
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(data));
  } else {
    response.statusCode = 404;
    response.end('Nicht gefunden');
  }
});

server.on('upgrade', (request, socket) => {
  if (new URL(request.url, 'http://localhost').pathname !== '/ws') return socket.destroy();
  const accept = createHash('sha1')
    .update(request.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.write(frame(JSON.stringify(data)));
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
  socket.on('error', () => sockets.delete(socket));
});

if (simulate) {
  let t = 0;
  setInterval(() => {
    t += 1;
    data.motor.rpm = Math.round(1480 + Math.sin(t / 5) * 220);
    data.motor.temperature = Math.round((62 + Math.sin(t / 9) * 14) * 10) / 10;
    data.motor.status = data.motor.temperature > 72 ? 'warning' : 'running';
    broadcast();
  }, 1000);
}

server.listen(port, () => console.log(`Beispiel-Datenquelle läuft auf http://localhost:${port} (/data, /events, /ws)`));
